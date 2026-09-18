use candle_core::{Result, Tensor, Var};
use candle_nn::VarMap;
use std::collections::HashMap;

pub struct Adam {
    vars: Vec<(String, Var, Tensor, Tensor)>,
    lr: f64,
    pub step: usize,
}
impl Adam {
    pub fn from_varmap(map: &VarMap, lr: f64) -> Result<Self> {
        Self::new(
            map.data()
                .lock()
                .unwrap()
                .iter()
                .map(|(n, v)| (n.clone(), v.clone()))
                .collect(),
            lr,
        )
    }
    pub fn new(vars: Vec<(String, Var)>, lr: f64) -> Result<Self> {
        Ok(Self {
            vars: vars
                .into_iter()
                .map(|(n, v)| {
                    let zero = v.zeros_like()?;
                    Ok((n, v, zero.clone(), zero))
                })
                .collect::<Result<_>>()?,
            lr,
            step: 0,
        })
    }
    pub fn backward_step(&mut self, loss: &Tensor) -> Result<()> {
        let grads = loss.backward()?;
        self.step += 1;
        let correction1 = 1.0 - 0.9_f64.powf(self.step as f64);
        let correction2 = 1.0 - 0.999_f64.powf(self.step as f64);
        for (_, var, m, v) in &mut self.vars {
            if let Some(g) = grads.get(var) {
                *m = ((&*m * 0.9)? + (g * 0.1)?)?.detach();
                *v = ((&*v * 0.999)? + (g.sqr()? * 0.001)?)?.detach();
                let update = ((&*m / correction1)? / ((&*v / correction2)?.sqrt()? + 1e-8)?)?;
                var.set(&(var.as_tensor() - (update * self.lr)?)?)?;
            }
        }
        Ok(())
    }
    pub fn save(&self, prefix: &str, tensors: &mut HashMap<String, Tensor>) {
        for (name, _, m, v) in &self.vars {
            tensors.insert(format!("{prefix}.{name}.m"), m.clone());
            tensors.insert(format!("{prefix}.{name}.v"), v.clone());
        }
    }
    pub fn restore(
        &mut self,
        prefix: &str,
        tensors: &HashMap<String, Tensor>,
        step: usize,
    ) -> Result<()> {
        for (name, var, m, v) in &mut self.vars {
            let saved_m = tensors.get(&format!("{prefix}.{name}.m")).ok_or_else(|| {
                candle_core::Error::Msg(format!("Missing Adam moment {prefix}.{name}"))
            })?;
            let saved_v = tensors.get(&format!("{prefix}.{name}.v")).ok_or_else(|| {
                candle_core::Error::Msg(format!("Missing Adam variance {prefix}.{name}"))
            })?;
            if saved_m.shape() != var.shape() || saved_v.shape() != var.shape() {
                candle_core::bail!("Invalid optimizer shape");
            }
            *m = saved_m.clone();
            *v = saved_v.clone();
        }
        self.step = step;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;
    #[test]
    fn restored_adam_matches_uninterrupted_updates() {
        let x = Var::new(&[2.0_f32], &Device::Cpu).unwrap();
        let mut first = Adam::new(vec![("x".into(), x.clone())], 0.03).unwrap();
        for _ in 0..7 {
            first.backward_step(&x.sqr().unwrap()).unwrap();
        }
        let y = Var::from_tensor(x.as_tensor()).unwrap();
        let mut resumed = Adam::new(vec![("x".into(), y.clone())], 0.03).unwrap();
        let mut tensors = HashMap::new();
        first.save("test", &mut tensors);
        resumed.restore("test", &tensors, first.step).unwrap();
        for _ in 0..11 {
            first.backward_step(&x.sqr().unwrap()).unwrap();
            resumed.backward_step(&y.sqr().unwrap()).unwrap();
        }
        assert_eq!(x.to_vec1::<f32>().unwrap(), y.to_vec1::<f32>().unwrap());
    }
}
