use std::{
    fmt,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Context};
use candle_core::{Device, Tensor as CandleTensor};
use ort::{session::Session, value::Tensor as OrtTensor};

use crate::protocol::{DiarizationResult, SpeakerSegment};

#[derive(Debug, Clone)]
pub struct AudioFrame {
    pub sample_rate: u32,
    pub channels: u8,
    pub samples: Vec<f32>,
}

#[derive(Clone)]
pub struct CandleDiarizer {
    device: Device,
    model: Option<Arc<ModelRuntime>>,
}

impl fmt::Debug for CandleDiarizer {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CandleDiarizer")
            .field("model_loaded", &self.model_loaded())
            .finish()
    }
}

impl CandleDiarizer {
    pub fn from_env() -> anyhow::Result<Self> {
        let model = match std::env::var("DIARIZATION_MODEL_PATH") {
            Ok(path) if !path.trim().is_empty() => Some(Arc::new(ModelRuntime::load(
                PathBuf::from(path),
                std::env::var("DIARIZATION_MODEL_INPUT").unwrap_or_else(|_| "input".to_string()),
            )?)),
            _ => None,
        };

        Ok(Self {
            device: Device::Cpu,
            model,
        })
    }

    pub fn model_loaded(&self) -> bool {
        self.model.is_some()
    }

    pub fn analyze(
        &self,
        processed_ms: u64,
        frame: AudioFrame,
    ) -> anyhow::Result<DiarizationResult> {
        let energy = frame_energy(&self.device, &frame.samples)?;
        let duration_ms = samples_to_ms(frame.samples.len(), frame.sample_rate, frame.channels);

        let Some(model) = &self.model else {
            return Err(anyhow!(
                "no diarization model loaded; set DIARIZATION_MODEL_PATH to an ONNX model"
            ));
        };

        let embedding = model.embed(&frame)?;
        let speaker_index = model.assign_speaker(&embedding, energy);

        Ok(DiarizationResult {
            processed_ms: processed_ms + duration_ms,
            speakers: vec![SpeakerSegment {
                speaker: format!("SPEAKER_{speaker_index:02}"),
                start_ms: processed_ms,
                end_ms: processed_ms + duration_ms,
                confidence: confidence_from_energy(energy),
            }],
        })
    }
}

struct ModelRuntime {
    session: Mutex<Session>,
    input_name: String,
}

impl ModelRuntime {
    fn load(path: PathBuf, input_name: String) -> anyhow::Result<Self> {
        let session = Session::builder()
            .context("failed to create ONNX Runtime session builder")?
            .commit_from_file(&path)
            .with_context(|| format!("failed to load ONNX model at {}", path.display()))?;

        Ok(Self {
            session: Mutex::new(session),
            input_name,
        })
    }

    fn embed(&self, frame: &AudioFrame) -> anyhow::Result<Vec<f32>> {
        let mono = mono_samples(frame);
        let input = OrtTensor::from_array(([1, mono.len()], mono))
            .context("failed to build ONNX Runtime input tensor")?;
        let mut session = self
            .session
            .lock()
            .map_err(|_| anyhow!("ONNX Runtime session mutex was poisoned"))?;
        let result = session
            .run(ort::inputs! {
                self.input_name.as_str() => input
            })
            .with_context(|| format!("ONNX inference failed for input {}", self.input_name))?;
        let (_shape, output) = result[0]
            .try_extract_tensor::<f32>()
            .context("ONNX output was not f32")?;

        Ok(output.iter().copied().collect())
    }

    fn assign_speaker(&self, embedding: &[f32], energy: f32) -> u8 {
        let centroid = if embedding.is_empty() {
            energy
        } else {
            embedding.iter().sum::<f32>() / embedding.len() as f32
        };

        if centroid.is_sign_positive() {
            1
        } else {
            2
        }
    }
}

fn mono_samples(frame: &AudioFrame) -> Vec<f32> {
    if frame.channels <= 1 {
        return frame.samples.clone();
    }

    frame
        .samples
        .chunks(frame.channels as usize)
        .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
        .collect()
}

fn frame_energy(device: &Device, samples: &[f32]) -> anyhow::Result<f32> {
    if samples.is_empty() {
        return Ok(0.0);
    }

    let tensor = CandleTensor::from_slice(samples, samples.len(), device)?;
    let squared = tensor.sqr()?;
    let mean = squared.mean_all()?.to_scalar::<f32>()?;
    Ok(mean.sqrt())
}

fn samples_to_ms(sample_count: usize, sample_rate: u32, channels: u8) -> u64 {
    if sample_rate == 0 || channels == 0 {
        return 0;
    }

    ((sample_count as f64 / channels as f64) / sample_rate as f64 * 1000.0).round() as u64
}

fn confidence_from_energy(energy: f32) -> f32 {
    (0.58 + energy.min(0.18) * 2.1).min(0.96)
}
