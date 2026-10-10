use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;

use candle_core::{DType, Device, Tensor};
use serde_json::Value;

use crate::text::pieces::vocabulary::PieceModel;
use crate::weights::PIECES_FILE;
use crate::Mimic;

const MODELS_VAR: &str = "MIMIC_MODELS";
const FIXTURES_VAR: &str = "MIMIC_FIXTURES";

fn directory(variable: &str) -> Option<PathBuf> {
    std::env::var_os(variable)
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
}

pub fn models_dir() -> Option<PathBuf> {
    directory(MODELS_VAR)
}

pub fn mimic() -> Option<&'static Mimic> {
    static MIMIC: OnceLock<Option<Mimic>> = OnceLock::new();
    MIMIC
        .get_or_init(|| models_dir().map(|dir| Mimic::load(&dir).unwrap()))
        .as_ref()
}

pub fn piece_model() -> Option<PieceModel> {
    let bytes = std::fs::read(models_dir()?.join(PIECES_FILE)).unwrap();
    Some(PieceModel::parse(&bytes).unwrap())
}

pub fn json_fixture(name: &str) -> Option<Value> {
    let path = directory(FIXTURES_VAR)?.join(format!("{name}.json"));
    let text = std::fs::read_to_string(path).ok()?;
    Some(serde_json::from_str(&text).unwrap())
}

pub struct Fixture {
    name: String,
    tensors: HashMap<String, Tensor>,
}

impl Fixture {
    pub fn load(name: &str) -> Option<Self> {
        let path = directory(FIXTURES_VAR)?.join(format!("{name}.safetensors"));
        if !path.is_file() {
            return None;
        }
        let tensors = candle_core::safetensors::load(path, &Device::Cpu).unwrap();
        Some(Self {
            name: name.to_string(),
            tensors,
        })
    }

    pub fn meta(&self) -> Value {
        json_fixture(&self.name).unwrap()
    }

    pub fn tensor(&self, key: &str) -> Tensor {
        match self.tensors.get(key) {
            Some(tensor) => tensor.clone(),
            None => panic!("fixture {} has no tensor {key}", self.name),
        }
    }

    pub fn floats(&self, key: &str) -> Vec<f32> {
        flat(&self.tensor(key))
    }

    pub fn rows(&self, key: &str) -> Vec<Vec<f32>> {
        self.tensor(key).to_vec2().unwrap()
    }

    pub fn ints(&self, key: &str) -> Vec<i64> {
        let tensor = self.tensor(key).to_dtype(DType::I64).unwrap();
        tensor.flatten_all().unwrap().to_vec1().unwrap()
    }

    pub fn units(&self, key: &str) -> Vec<u32> {
        self.ints(key).into_iter().map(|id| id as u32).collect()
    }
}

pub fn flat(tensor: &Tensor) -> Vec<f32> {
    tensor.flatten_all().unwrap().to_vec1().unwrap()
}

#[derive(Debug, Clone, Copy)]
pub struct Mismatch {
    pub max_abs: f32,
    pub relative: f32,
    pub peak_relative: f32,
}

pub fn compare(label: &str, actual: &[f32], expected: &[f32]) -> Mismatch {
    assert_eq!(actual.len(), expected.len(), "{label}: lengths differ");
    let mut max_abs = 0.0f64;
    let mut error_energy = 0.0f64;
    let mut energy = 0.0f64;
    let mut peak = 0.0f64;
    for (a, e) in actual.iter().zip(expected) {
        let (a, e) = (f64::from(*a), f64::from(*e));
        max_abs = max_abs.max((a - e).abs());
        error_energy += (a - e).powi(2);
        energy += e * e;
        peak = peak.max(e.abs());
    }
    let mismatch = Mismatch {
        max_abs: max_abs as f32,
        relative: (error_energy / energy.max(f64::MIN_POSITIVE)).sqrt() as f32,
        peak_relative: (max_abs / peak.max(f64::MIN_POSITIVE)) as f32,
    };
    println!(
        "parity {label}: relative {:.2e}, max abs {:.2e}, of peak {:.2e} ({} values)",
        mismatch.relative,
        mismatch.max_abs,
        mismatch.peak_relative,
        actual.len()
    );
    mismatch
}

pub fn quiet_relative(actual: &[f32], expected: &[f32]) -> f32 {
    let squares = |pairs: &mut dyn Iterator<Item = f64>| pairs.map(|x| x * x).sum::<f64>();
    let mut errors = actual
        .iter()
        .zip(expected)
        .map(|(a, e)| f64::from(*a) - f64::from(*e));
    let mut values = expected.iter().map(|e| f64::from(*e));
    (squares(&mut errors) / squares(&mut values).max(f64::MIN_POSITIVE)).sqrt() as f32
}

pub fn compare_tensors(label: &str, actual: &Tensor, expected: &Tensor) -> Mismatch {
    assert_eq!(actual.dims(), expected.dims(), "{label}: shapes differ");
    compare(label, &flat(actual), &flat(expected))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mismatch_reports_absolute_and_relative_error() {
        let mismatch = compare("self-check", &[1.0, 2.0, 4.5], &[1.0, 2.0, 4.0]);
        assert_eq!(mismatch.max_abs, 0.5);
        assert!((mismatch.peak_relative - 0.125).abs() < 1e-7);
        assert!((mismatch.relative - 0.5 / 21f32.sqrt()).abs() < 1e-6);
    }

    #[test]
    fn identical_inputs_have_no_mismatch() {
        let mismatch = compare("self-check", &[0.0, 3.0], &[0.0, 3.0]);
        assert_eq!((mismatch.max_abs, mismatch.relative), (0.0, 0.0));
    }
}
