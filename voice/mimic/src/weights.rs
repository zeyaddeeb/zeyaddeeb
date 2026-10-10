mod acoustics;
mod planner;
mod units;
mod vocoder;
mod voiceprint;

use std::collections::{BTreeMap, HashMap};
use std::fmt::Display;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use anyhow::{bail, ensure, Context, Result};
use candle_core::{Device, Shape, Tensor};
use candle_nn::{Conv1d, Conv1dConfig, Embedding, Linear};
use serde::Deserialize;

use crate::acoustics::AcousticModel;
use crate::planner::Planner;
use crate::settings::Settings;
use crate::units::UnitEncoder;
use crate::vocoder::Vocoder;
use crate::voiceprint::VoiceprintEncoder;

pub const PIECES_FILE: &str = "tokenizer.model";
const GENERATOR_FILE: &str = "model.safetensors";
const UNITS_FILE: &str = "semantic_encoder.safetensors";
const VOICEPRINT_FILE: &str = "speaker_encoder.safetensors";
const VOCODER_FILE: &str = "vocoder.safetensors";

const METADATA_KEY: &str = "__metadata__";
const FLOAT_KIND: &str = "F32";
const FLOAT_BYTES: usize = 4;
const HEADER_LIMIT: u64 = 64 << 20;

pub struct Models {
    pub planner: Planner,
    pub acoustics: AcousticModel,
    pub units: UnitEncoder,
    pub voiceprint: VoiceprintEncoder,
    pub vocoder: Vocoder,
}

pub fn load(dir: &Path, settings: &Settings) -> Result<Models> {
    let generator = TensorFile::open(&dir.join(GENERATOR_FILE))?;
    Ok(Models {
        planner: planner::assemble(&generator.root(), settings)?,
        acoustics: acoustics::assemble(&generator.root(), settings)?,
        units: units::assemble(&TensorFile::open(&dir.join(UNITS_FILE))?.root(), settings)?,
        voiceprint: voiceprint::assemble(
            &TensorFile::open(&dir.join(VOICEPRINT_FILE))?.root(),
            &settings.voiceprint,
        )?,
        vocoder: vocoder::assemble(&TensorFile::open(&dir.join(VOCODER_FILE))?.root(), settings)?,
    })
}

#[derive(Deserialize)]
struct Entry {
    dtype: String,
    shape: Vec<usize>,
    data_offsets: (u64, u64),
}

pub struct TensorFile {
    name: String,
    tensors: HashMap<String, Tensor>,
}

impl TensorFile {
    pub fn open(path: &Path) -> Result<Self> {
        let name = path.display().to_string();
        let tensors = read_tensors(path).with_context(|| format!("reading {name}"))?;
        Ok(Self { name, tensors })
    }

    pub fn root(&self) -> Scope<'_> {
        Scope {
            file: self,
            prefix: String::new(),
        }
    }
}

fn read_tensors(path: &Path) -> Result<HashMap<String, Tensor>> {
    let mut file = File::open(path)?;
    let entries = read_header(&mut file)?;
    let data_start = file.stream_position()?;
    entries
        .into_iter()
        .map(|(name, entry)| {
            let tensor = read_tensor(&mut file, data_start, &entry)
                .with_context(|| format!("tensor {name}"))?;
            Ok((name, tensor))
        })
        .collect()
}

fn read_header(file: &mut File) -> Result<BTreeMap<String, Entry>> {
    let mut length = [0u8; 8];
    file.read_exact(&mut length)?;
    let length = u64::from_le_bytes(length);
    ensure!(
        length <= HEADER_LIMIT,
        "header of {length} bytes is too large"
    );
    let mut header = vec![0u8; length as usize];
    file.read_exact(&mut header)?;
    let mut fields: BTreeMap<String, serde_json::Value> = serde_json::from_slice(&header)?;
    fields.remove(METADATA_KEY);
    fields
        .into_iter()
        .map(|(name, value)| Ok((name, serde_json::from_value(value)?)))
        .collect()
}

fn read_tensor(file: &mut File, data_start: u64, entry: &Entry) -> Result<Tensor> {
    ensure!(
        entry.dtype == FLOAT_KIND,
        "unsupported element type {}",
        entry.dtype
    );
    let (start, end) = entry.data_offsets;
    let count: usize = entry.shape.iter().product();
    ensure!(
        end >= start && (end - start) as usize == count * FLOAT_BYTES,
        "byte range does not match shape {:?}",
        entry.shape
    );
    let mut bytes = vec![0u8; count * FLOAT_BYTES];
    file.seek(SeekFrom::Start(data_start + start))?;
    file.read_exact(&mut bytes)?;
    let (chunks, _) = bytes.as_chunks::<FLOAT_BYTES>();
    let values: Vec<f32> = chunks
        .iter()
        .map(|chunk| f32::from_le_bytes(*chunk))
        .collect();
    Ok(Tensor::from_vec(
        values,
        entry.shape.as_slice(),
        &Device::Cpu,
    )?)
}

#[derive(Clone)]
pub struct Scope<'a> {
    file: &'a TensorFile,
    prefix: String,
}

impl Scope<'_> {
    pub fn at(&self, name: impl Display) -> Self {
        Self {
            file: self.file,
            prefix: self.key(&name.to_string()),
        }
    }

    fn key(&self, name: &str) -> String {
        if self.prefix.is_empty() {
            name.to_string()
        } else {
            format!("{}.{name}", self.prefix)
        }
    }

    pub fn tensor(&self, name: &str, shape: impl Into<Shape>) -> Result<Tensor> {
        let key = self.key(name);
        let Some(tensor) = self.file.tensors.get(&key) else {
            bail!("{} has no tensor {key}", self.file.name);
        };
        let shape = shape.into();
        ensure!(
            tensor.shape() == &shape,
            "{key} has shape {:?}, expected {shape:?}",
            tensor.shape()
        );
        Ok(tensor.clone())
    }

    pub fn dense(&self, name: &str, inputs: usize, outputs: usize) -> Result<Linear> {
        let scope = self.at(name);
        let weight = scope.tensor("weight", (outputs, inputs))?;
        Ok(Linear::new(weight, Some(scope.tensor("bias", outputs)?)))
    }

    pub fn dense_no_bias(&self, name: &str, inputs: usize, outputs: usize) -> Result<Linear> {
        let weight = self.at(name).tensor("weight", (outputs, inputs))?;
        Ok(Linear::new(weight, None))
    }

    pub fn conv(&self, name: &str, shape: ConvShape) -> Result<Conv1d> {
        let scope = self.at(name);
        let per_group = shape.inputs / shape.groups;
        let weight = scope.tensor("weight", (shape.outputs, per_group, shape.kernel))?;
        let bias = scope.tensor("bias", shape.outputs)?;
        let config = Conv1dConfig {
            stride: shape.stride,
            groups: shape.groups,
            ..Default::default()
        };
        Ok(Conv1d::new(weight, Some(bias), config))
    }

    pub fn table(&self, name: &str, rows: usize, width: usize) -> Result<Embedding> {
        let weight = self.at(name).tensor("weight", (rows, width))?;
        Ok(Embedding::new(weight, width))
    }

    pub fn affine(&self, name: &str, width: usize) -> Result<(Tensor, Tensor)> {
        let scope = self.at(name);
        Ok((scope.tensor("weight", width)?, scope.tensor("bias", width)?))
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ConvShape {
    pub inputs: usize,
    pub outputs: usize,
    pub kernel: usize,
    pub stride: usize,
    pub groups: usize,
}

impl ConvShape {
    pub fn new(inputs: usize, outputs: usize, kernel: usize) -> Self {
        Self {
            inputs,
            outputs,
            kernel,
            stride: 1,
            groups: 1,
        }
    }

    pub fn stride(self, stride: usize) -> Self {
        Self { stride, ..self }
    }

    pub fn groups(self, groups: usize) -> Self {
        Self { groups, ..self }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_file(dir: &Path, header: &str, data: &[f32]) -> std::path::PathBuf {
        let path = dir.join("tiny.safetensors");
        let mut file = File::create(&path).unwrap();
        file.write_all(&(header.len() as u64).to_le_bytes())
            .unwrap();
        file.write_all(header.as_bytes()).unwrap();
        for value in data {
            file.write_all(&value.to_le_bytes()).unwrap();
        }
        path
    }

    fn scratch(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mimic-weights-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    const HEADER: &str = r#"{"__metadata__":{"format":"pt"},"layer.bias":{"dtype":"F32","shape":[2],"data_offsets":[24,32]},"layer.weight":{"dtype":"F32","shape":[2,3],"data_offsets":[0,24]}}"#;

    #[test]
    fn reads_tensors_by_scoped_name() {
        let dir = scratch("read");
        let data = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 0.5, -0.5];
        let file = TensorFile::open(&write_file(&dir, HEADER, &data)).unwrap();
        let layer = file.root().at("layer");
        let weight = layer.tensor("weight", (2, 3)).unwrap();
        assert_eq!(
            weight.to_vec2::<f32>().unwrap(),
            [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]]
        );
        let dense = file.root().dense("layer", 3, 2).unwrap();
        assert_eq!(dense.bias().unwrap().to_vec1::<f32>().unwrap(), [0.5, -0.5]);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn missing_or_misshapen_tensors_are_errors() {
        let dir = scratch("errors");
        let data = [0.0; 8];
        let file = TensorFile::open(&write_file(&dir, HEADER, &data)).unwrap();
        assert!(file.root().tensor("absent", 1).is_err());
        assert!(file.root().at("layer").tensor("weight", (3, 2)).is_err());
        assert!(file.root().dense("layer", 2, 3).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn other_element_types_and_bad_ranges_are_rejected() {
        let dir = scratch("kinds");
        let ints = r#"{"x":{"dtype":"I64","shape":[1],"data_offsets":[0,8]}}"#;
        assert!(TensorFile::open(&write_file(&dir, ints, &[0.0, 0.0])).is_err());
        let short = r#"{"x":{"dtype":"F32","shape":[4],"data_offsets":[0,8]}}"#;
        assert!(TensorFile::open(&write_file(&dir, short, &[0.0, 0.0])).is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn conv_shape_builder_sets_stride_and_groups() {
        let shape = ConvShape::new(8, 16, 3).stride(2).groups(4);
        assert_eq!((shape.inputs, shape.outputs, shape.kernel), (8, 16, 3));
        assert_eq!((shape.stride, shape.groups), (2, 4));
    }

    #[test]
    fn parity_computed_filterbanks_match_the_stored_ones() {
        let Some(dir) = crate::testing::models_dir() else {
            return;
        };
        let settings = Settings::load(&dir).unwrap();
        let units = crate::units::features::Features::new(&settings.units);
        let voiceprint = crate::voiceprint::features::Features::new(&settings.voiceprint);
        let vocoder = crate::vocoder::analysis(&settings);
        let front_end = "frontend.mel.mel_scale.fb";
        let cases = [
            (UNITS_FILE, front_end, units.mel().filterbank()),
            (VOICEPRINT_FILE, front_end, voiceprint.mel().filterbank()),
            (
                VOCODER_FILE,
                "feature_extractor.mel_spec.mel_scale.fb",
                vocoder.filterbank(),
            ),
        ];
        for (file, key, computed) in cases {
            let stored = &TensorFile::open(&dir.join(file)).unwrap().tensors[key];
            let stored = crate::testing::flat(&stored.t().unwrap().contiguous().unwrap());
            let label = format!("mel filterbank in {file}");
            let error = crate::testing::compare(&label, computed.weights(), &stored);
            assert!(error.peak_relative < 1e-4, "{error:?}");
        }
    }
}
