use crate::{
    cups::{
        net::{Net, Shape},
        task::{cup, swap, Kind, Shuffle, CUPS, IGNORE, MOST},
    },
    curriculum::Rng,
};
use anyhow::Result;
use candle_core::{backprop::GradStore, Device, Tensor, D};
use candle_nn::{AdamW, Optimizer, ParamsAdamW};

const CLIP: f32 = 1.0;
const WARMUP: usize = 300;

#[derive(Clone, Copy, Debug)]
pub struct Plan {
    pub kind: Kind,
    pub shape: Shape,
    pub steps: usize,
    pub batch: usize,
    pub lr: f64,
    pub seed: u64,
}

pub struct Report {
    pub step: usize,
    pub loss: f32,
    pub grad: f32,
}

pub fn batch(kind: Kind, shuffles: &[Shuffle], device: &Device) -> Result<(Tensor, Tensor, f32)> {
    let time = kind.length(MOST);
    let mut tokens = Vec::with_capacity(shuffles.len() * time);
    let mut onehot = vec![0f32; shuffles.len() * time * CUPS];
    let mut count = 0f32;

    for (b, shuffle) in shuffles.iter().enumerate() {
        let (input, target) = shuffle.encode(kind);

        tokens.extend_from_slice(&input);

        for (t, &label) in target.iter().enumerate() {
            if label != IGNORE {
                onehot[(b * time + t) * CUPS + label as usize] = 1.0;
                count += 1.0;
            }
        }
    }

    Ok((
        Tensor::from_vec(tokens, (shuffles.len(), time), device)?,
        Tensor::from_vec(onehot, (shuffles.len(), time, CUPS), device)?,
        count,
    ))
}

fn rate(plan: &Plan, step: usize) -> f64 {
    if step < WARMUP {
        return plan.lr * (step + 1) as f64 / WARMUP as f64;
    }

    let progress = (step - WARMUP) as f64 / (plan.steps - WARMUP).max(1) as f64;

    plan.lr * (0.1 + 0.9 * 0.5 * (1.0 + (std::f64::consts::PI * progress).cos()))
}

fn clip(net: &Net, grads: &mut GradStore) -> Result<f32> {
    let mut total = 0f32;

    for (_, var) in &net.vars {
        if let Some(grad) = grads.get(var.as_tensor()) {
            total += grad.sqr()?.sum_all()?.to_scalar::<f32>()?;
        }
    }

    let norm = total.sqrt();

    if norm.is_finite() && norm > CLIP {
        let scale = (CLIP / norm) as f64;

        for (_, var) in &net.vars {
            if let Some(grad) = grads.remove(var.as_tensor()) {
                grads.insert(var.as_tensor(), (grad * scale)?);
            }
        }
    }

    Ok(norm)
}

pub fn train(plan: Plan, device: &Device, mut log: impl FnMut(&Net, &Report)) -> Result<Net> {
    let net = Net::fresh(plan.shape, plan.seed, device)?;
    let mut rng = Rng::new(plan.seed ^ 0x5eed_c0de);
    let mut opt = AdamW::new(
        net.vars.iter().map(|(_, v)| v.clone()).collect(),
        ParamsAdamW {
            lr: plan.lr,
            weight_decay: 0.01,
            ..Default::default()
        },
    )?;

    for step in 0..plan.steps {
        let shuffles: Vec<Shuffle> = (0..plan.batch)
            .map(|_| Shuffle::random(&mut rng, MOST))
            .collect();
        let (tokens, onehot, count) = batch(plan.kind, &shuffles, device)?;
        let loss = net.loss(&tokens, &onehot, count)?;
        let mut grads = loss.backward()?;
        let grad = clip(&net, &mut grads)?;

        opt.set_learning_rate(rate(&plan, step));
        opt.step(&grads)?;

        log(
            &net,
            &Report {
                step,
                loss: loss.to_scalar::<f32>()?,
                grad,
            },
        );
    }

    Ok(net)
}

fn argmax(logits: &Tensor) -> Result<Vec<Vec<u32>>> {
    Ok(logits.argmax(D::Minus1)?.to_vec2::<u32>()?)
}

pub fn read(net: &Net, kind: Kind, shuffles: &[Shuffle]) -> Result<Vec<Vec<usize>>> {
    let device = net.device();

    match kind {
        Kind::Blurts => {
            let tokens: Vec<Vec<u32>> = shuffles.iter().map(|s| s.encode(kind).0).collect();
            let time = tokens[0].len();
            let flat = Tensor::from_vec(tokens.concat(), (shuffles.len(), time), device)?;
            let guesses = argmax(&net.forward(&flat)?)?;

            Ok(guesses
                .into_iter()
                .map(|row| row[1..].iter().map(|&g| g as usize).collect())
                .collect())
        }
        Kind::Notes => write(net, shuffles, &vec![None; shuffles.len()]),
    }
}

fn write(
    net: &Net,
    shuffles: &[Shuffle],
    forged: &[Option<(usize, usize)>],
) -> Result<Vec<Vec<usize>>> {
    let device = net.device();
    let steps = shuffles[0].swaps.len();
    let mut tokens: Vec<Vec<u32>> = shuffles.iter().map(|s| vec![cup(s.start)]).collect();
    let mut notes = vec![Vec::with_capacity(steps); shuffles.len()];

    for i in 0..steps {
        for (row, shuffle) in tokens.iter_mut().zip(shuffles) {
            row.push(swap(shuffle.swaps[i]));
        }

        let time = tokens[0].len();
        let flat = Tensor::from_vec(tokens.concat(), (shuffles.len(), time), device)?;
        let last = net.forward(&flat)?.narrow(1, time - 1, 1)?;
        let guesses = argmax(&last)?;

        for (((row, written), guess), forgery) in
            tokens.iter_mut().zip(&mut notes).zip(guesses).zip(forged)
        {
            let note = match forgery {
                Some((at, to)) if *at == i => *to as u32,
                _ => guess[0],
            };

            row.push(note);
            written.push(note as usize);
        }
    }

    Ok(notes)
}

pub fn follows(net: &Net, count: usize, seed: u64) -> Result<f32> {
    let mut rng = Rng::new(seed);
    let shuffles: Vec<Shuffle> = (0..count)
        .map(|_| Shuffle::uniform(&mut rng, MOST))
        .collect();
    let forged: Vec<Option<(usize, usize)>> = shuffles
        .iter()
        .map(|s| {
            let at = rng.below(MOST - 1);
            let truth = s.trail()[at];

            Some((at, (truth + 1 + rng.below(CUPS - 1)) % CUPS))
        })
        .collect();
    let mut hits = 0;

    for chunk in (0..count).collect::<Vec<_>>().chunks(500) {
        let part: Vec<Shuffle> = chunk.iter().map(|&i| shuffles[i].clone()).collect();
        let marks: Vec<Option<(usize, usize)>> = chunk.iter().map(|&i| forged[i]).collect();
        let notes = write(net, &part, &marks)?;

        for ((shuffle, mark), written) in part.iter().zip(&marks).zip(&notes) {
            let (at, to) = mark.unwrap_or((0, 0));
            let expected = Shuffle {
                start: to,
                swaps: shuffle.swaps[at + 1..].to_vec(),
            };
            let end = expected.trail().last().copied().unwrap_or(to);

            hits += usize::from(written.last() == Some(&end));
        }
    }

    Ok(hits as f32 / count as f32)
}

pub fn curve(net: &Net, kind: Kind, count: usize, seed: u64) -> Result<Vec<f32>> {
    let mut rng = Rng::new(seed);
    let mut right = vec![0usize; MOST];
    let mut done = 0;

    while done < count {
        let size = (count - done).min(500);
        let shuffles: Vec<Shuffle> = (0..size)
            .map(|_| Shuffle::uniform(&mut rng, MOST))
            .collect();

        for (guesses, shuffle) in read(net, kind, &shuffles)?.iter().zip(&shuffles) {
            for (i, (g, t)) in guesses.iter().zip(shuffle.trail()).enumerate() {
                right[i] += usize::from(*g == t);
            }
        }

        done += size;
    }

    Ok(right.iter().map(|&r| r as f32 / count as f32).collect())
}
