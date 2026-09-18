use crate::{
    curriculum::{self, evaluate, Example, Family, Rng, Vocabulary, ANSWER, BOS, EOS, PAD},
    model::{Config, Interrupted, Model, Trace, TraceRequest},
    protocol::*,
};
use anyhow::Result;
use candle_core::{backprop::GradStore, Tensor, D};
use candle_nn::{
    ops::{log_softmax, softmax},
    AdamW, Optimizer, ParamsAdamW,
};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

pub const BATCH: usize = 4;
pub const GROUP: usize = 4;
const CLIP: f32 = 1.0;
const RL_CLIP: f32 = 0.2;
const RL_KL: f64 = 0.04;
const RL_EPOCHS: usize = 2;
const ANSWER_TOKENS: usize = 2;
const EVALUATION_PER_FAMILY: usize = 4;
const DREAM_INTERVAL: Duration = Duration::from_millis(2500);

pub trait Control {
    fn check(&mut self, stage: &str) -> Result<()>;
    fn commit(&mut self, apply: &mut dyn FnMut() -> Result<(u64, u64)>) -> Result<bool>;
}

pub struct Unattended;

impl Control for Unattended {
    fn check(&mut self, _: &str) -> Result<()> {
        Ok(())
    }

    fn commit(&mut self, apply: &mut dyn FnMut() -> Result<(u64, u64)>) -> Result<bool> {
        apply().map(|_| true)
    }
}

pub struct Specimen {
    pub source: String,
    pub code: String,
    pub question: String,
    pub truth: Option<String>,
    pub note: Option<String>,
    pub ids: Vec<u32>,
    pub answer_at: usize,
}

struct Student {
    model: Model,
    opt: AdamW,
}

type Batch = (Vec<Example>, Vec<Vec<u32>>, Vec<usize>);

pub struct StepReport {
    pub loss: f32,
    pub grad_norm: f32,
    pub clipped: bool,
    pub committed: bool,
    pub reading: Vec<String>,
    pub auxiliary: AuxiliaryView,
}

pub struct Brain {
    pub vocab: Vocabulary,
    pub model: Model,
    opt: AdamW,
    rng: Rng,
    dream_rng: Rng,
    last_dream: Option<(u64, Instant)>,
    pub dreaming: bool,
    pub step: u64,
    pub revision: u64,
    pub phase_steps: PhaseSteps,
    pub specimen: Specimen,
    pub focus: usize,
    reference: Option<Model>,
    teacher: Option<Model>,
    student: Option<Student>,
    evaluation: Vec<Example>,
    cards: Vec<Example>,
    home: Example,
    baseline: Vec<(String, Vec<f32>)>,
    seen: HashMap<(usize, usize, usize), Vec<u32>>,
    pub numerical_failures: u64,
}

fn optimizer(model: &Model, lr: f64) -> Result<AdamW> {
    Ok(AdamW::new(
        model.vars(),
        ParamsAdamW {
            lr,
            weight_decay: 0.01,
            ..Default::default()
        },
    )?)
}

impl Brain {
    pub fn new(seed: u64) -> Result<Self> {
        let vocab = Vocabulary::default();
        let model = Model::new(Config::lab(vocab.words.len()), seed)?;
        let opt = optimizer(&model, Phase::Pretrain.learning_rate())?;
        let held_out = curriculum::held_out_set();
        let mut evaluation = Vec::new();
        for family in curriculum::FAMILIES {
            let members: Vec<_> = held_out.iter().filter(|e| e.family == family).collect();
            let stride = (members.len() / EVALUATION_PER_FAMILY).max(1);
            evaluation.extend(
                members
                    .iter()
                    .step_by(stride)
                    .take(EVALUATION_PER_FAMILY)
                    .map(|e| (*e).clone()),
            );
        }
        let cards = [
            Family::Reassign,
            Family::ImmutableReassign,
            Family::Compare,
            Family::Branch,
            Family::Add,
            Family::Chain,
        ]
        .iter()
        .filter_map(|family| {
            held_out
                .iter()
                .filter(|e| {
                    e.family == *family && !evaluation.iter().any(|x| x.prompt() == e.prompt())
                })
                .nth(1)
                .cloned()
        })
        .collect();
        let first = curriculum::build(Family::Reassign, 0, 2, 8);
        debug_assert!(first.held_out);
        let baseline = model.groups()?;
        let mut brain = Self {
            specimen: Specimen {
                source: "heldOut".into(),
                code: String::new(),
                question: String::new(),
                truth: None,
                note: None,
                ids: Vec::new(),
                answer_at: 0,
            },
            vocab,
            model,
            opt,
            rng: Rng::new(seed ^ 0x5eed),
            dream_rng: Rng::new(seed ^ 0xd4ea),
            last_dream: None,
            dreaming: true,
            step: 0,
            revision: 0,
            phase_steps: PhaseSteps::default(),
            focus: 0,
            reference: None,
            teacher: None,
            student: None,
            evaluation,
            cards,
            home: first.clone(),
            baseline,
            seen: HashMap::new(),
            numerical_failures: 0,
        };
        brain.set_specimen("heldOut", &first.code, &first.question)?;
        Ok(brain)
    }

    pub fn info(&self) -> ModelInfo {
        let cfg = &self.model.cfg;
        ModelInfo {
            parameters: self.model.parameter_count(),
            student_parameters: Model::new(Config::student(cfg.vocab), 1)
                .map(|m| m.parameter_count())
                .unwrap_or(0),
            vocab_size: cfg.vocab,
            hidden: cfg.hidden,
            heads: cfg.heads,
            encoder_layers: cfg.encoder_layers,
            decoder_layers: cfg.layers() - cfg.encoder_layers,
            experts: cfg.experts,
            active_experts: cfg.active_experts,
            expert_width: cfg.expert_width,
            residual_streams: cfg.streams,
            window: cfg.window,
            compression: cfg.encoder_ratio,
            top_blocks: cfg.encoder_top,
            engram_buckets: cfg.engram_buckets(),
            schedule: cfg
                .schedule
                .iter()
                .enumerate()
                .map(|(layer, mode)| LayerInfo {
                    layer,
                    stack: stack(cfg, layer).into(),
                    mode: mode.as_str().into(),
                    engram: cfg.engram_layers.contains(&layer),
                })
                .collect(),
            device: "cpu · f32".into(),
            uniform_loss: (cfg.vocab as f32).ln(),
            vocabulary: self.vocab.words.clone(),
        }
    }

    pub fn set_specimen(&mut self, source: &str, code: &str, question: &str) -> Result<()> {
        check_snippet(code, question)?;
        let mut ids = vec![BOS];
        ids.extend(self.vocab.encode(code)?);
        anyhow::ensure!(ids.len() > 1, "Write a line of Rust first.");
        let asked = self.vocab.encode(question)?;
        let words: Vec<&str> = question.split_whitespace().collect();
        let (truth, note) = match words.as_slice() {
            ["value", "of", binding, "?"] => match evaluate(code, binding) {
                Ok(value) => (Some(value.to_string()), None),
                Err(error) => (None, Some(error.to_string())),
            },
            ["valid", "reassignment", "?"] => match evaluate(code, "x")
                .or_else(|_| evaluate(code, "y"))
                .or_else(|_| evaluate(code, "z"))
            {
                Ok(_) => (Some("yes".into()), None),
                Err(error) => (Some("no".into()), Some(error.to_string())),
            },
            _ => anyhow::bail!("Ask either \"value of x ?\" or \"valid reassignment ?\"."),
        };
        ids.extend(asked);
        ids.push(ANSWER);
        anyhow::ensure!(
            ids.len() + ANSWER_TOKENS <= 48,
            "That snippet is too long for a 48-token line."
        );
        self.focus = ids.len() - 1;
        self.specimen = Specimen {
            source: source.into(),
            code: code.into(),
            question: question.into(),
            truth,
            note,
            answer_at: ids.len(),
            ids,
        };
        Ok(())
    }

    pub fn set_focus(&mut self, position: usize) {
        self.focus = position.min(self.specimen.ids.len() - 1);
    }

    fn batch(&mut self, pretrain: bool) -> Result<Batch> {
        let examples: Vec<_> = (0..BATCH)
            .map(|_| curriculum::sample(&mut self.rng, pretrain))
            .collect();
        let mut rows = Vec::new();
        let mut answers = Vec::new();
        for example in &examples {
            let (ids, answer_at) = example.sequence(&self.vocab, pretrain)?;
            rows.push(ids);
            answers.push(answer_at);
        }
        Ok((examples, rows, answers))
    }

    pub fn language_step(&mut self, phase: Phase, control: &mut dyn Control) -> Result<StepReport> {
        let pretrain = phase == Phase::Pretrain;
        let (_, rows, answers) = self.batch(pretrain)?;
        let lengths: Vec<usize> = rows.iter().map(Vec::len).collect();
        let ids = pad(rows);
        let seq = ids[0].len();
        let mut weight = vec![0f32; BATCH * (seq - 1)];
        for (row, (&len, &answer_at)) in lengths.iter().zip(&answers).enumerate() {
            let from = if pretrain { 1 } else { answer_at };
            for target in from..len {
                weight[row * (seq - 1) + target - 1] = 1.0;
            }
        }
        let out = self
            .model
            .forward(&ids, 0, None, &mut |stage| control.check(stage))?;
        let loss = masked_nll(&out.logits, &ids, &weight)?;
        let total = (&loss + &out.indexer_loss)?;
        // The exact token rows fed forward, markers included, so the UI can show them.
        let reading = ids
            .iter()
            .zip(&lengths)
            .map(|(row, &len)| self.vocab.decode_all(&row[..len]))
            .collect();
        let auxiliary = AuxiliaryView {
            indexer_loss: out.indexer_loss.to_scalar::<f32>()?,
            expert_load: mean_load(&out.load),
            router_bias: Vec::new(),
        };
        let load = out.load;
        let mut report = self.apply(total, phase, control, Some(load))?;
        report.loss = loss.to_scalar::<f32>()?;
        report.reading = reading;
        report.auxiliary = AuxiliaryView {
            router_bias: mean_load(&self.model.router_bias),
            ..auxiliary
        };
        if report.committed {
            match phase {
                Phase::Pretrain => self.phase_steps.pretrain += 1,
                _ => self.phase_steps.sft += 1,
            }
        }
        Ok(report)
    }

    fn apply(
        &mut self,
        loss: Tensor,
        phase: Phase,
        control: &mut dyn Control,
        load: Option<Vec<Vec<f32>>>,
    ) -> Result<StepReport> {
        control.check("backward")?;
        let mut grads = loss.backward()?;
        control.check("optimizer preparation")?;
        let (grad_norm, clipped) = clip(&self.model, &mut grads)?;
        let mut report = StepReport {
            loss: loss.to_scalar::<f32>()?,
            grad_norm,
            clipped,
            committed: false,
            reading: Vec::new(),
            auxiliary: AuxiliaryView::default(),
        };
        if !(report.loss.is_finite() && grad_norm.is_finite()) {
            self.numerical_failures += 1;
            anyhow::ensure!(
                self.numerical_failures < 8,
                "Training diverged: the last updates were not finite numbers."
            );
            return Ok(report);
        }
        self.opt.set_learning_rate(phase.learning_rate());
        let (model, opt) = (&mut self.model, &mut self.opt);
        let (step, revision) = (&mut self.step, &mut self.revision);
        report.committed = control.commit(&mut || {
            opt.step(&grads)?;
            if let Some(load) = &load {
                model.rebalance(load);
            }
            *step += 1;
            *revision += 1;
            Ok((*step, *revision))
        })?;
        Ok(report)
    }

    pub fn freeze_reference(&mut self) -> Result<()> {
        self.reference = Some(self.model.frozen_copy()?);
        Ok(())
    }

    pub fn reinforcement_step(
        &mut self,
        operation_id: uuid::Uuid,
        control: &mut dyn Control,
    ) -> Result<(StepReport, RolloutView)> {
        if self.reference.is_none() {
            self.freeze_reference()?;
        }
        let examples: Vec<_> = (0..BATCH)
            .map(|_| curriculum::sample(&mut self.rng, false))
            .collect();
        let mut prompts = Vec::new();
        for example in &examples {
            let (ids, answer_at) = example.sequence(&self.vocab, false)?;
            prompts.push(ids[..answer_at].to_vec());
        }

        let mut rows: Vec<Vec<u32>> = Vec::new();
        let mut old: Vec<Vec<f32>> = Vec::new();
        for prompt in &prompts {
            for _ in 0..GROUP {
                rows.push(prompt.clone());
                old.push(Vec::new());
            }
        }
        let mut open = vec![true; rows.len()];
        for token in 0..ANSWER_TOKENS {
            control.check(&format!("rollout · token {}", token + 1))?;
            let lengths: Vec<usize> = rows.iter().map(Vec::len).collect();
            let out = self
                .model
                .forward(&pad(rows.clone()), 0, None, &mut |s| control.check(s))?;
            let probabilities = softmax(&out.logits, D::Minus1)?.to_vec3::<f32>()?;
            for (row, sequence) in rows.iter_mut().enumerate() {
                if !open[row] {
                    continue;
                }
                let distribution = &probabilities[row][lengths[row] - 1];
                let pick = sample(distribution, &mut self.rng);
                old[row].push(distribution[pick].max(1e-9).ln());
                sequence.push(pick as u32);
                open[row] = pick as u32 != EOS;
            }
        }
        let answers: Vec<String> = rows
            .iter()
            .enumerate()
            .map(|(row, ids)| self.answer_text(&ids[prompts[row / GROUP].len()..]))
            .collect();
        let rewards: Vec<f32> = answers
            .iter()
            .enumerate()
            .map(|(row, text)| {
                let (exact, format) = examples[row / GROUP].reward(text);
                exact + format
            })
            .collect();
        let mut advantages = vec![0f32; rows.len()];
        for group in 0..BATCH {
            let slice = &rewards[group * GROUP..(group + 1) * GROUP];
            let mean = slice.iter().sum::<f32>() / GROUP as f32;
            let std = (slice.iter().map(|r| (r - mean).powi(2)).sum::<f32>() / GROUP as f32).sqrt();
            for (i, reward) in slice.iter().enumerate() {
                advantages[group * GROUP + i] = if std > 1e-6 {
                    (reward - mean) / (std + 1e-4)
                } else {
                    0.0
                };
            }
        }

        let mut report = StepReport {
            loss: 0.0,
            grad_norm: 0.0,
            clipped: false,
            committed: false,
            reading: examples.iter().map(Example::prompt).collect(),
            auxiliary: AuxiliaryView::default(),
        };
        let mut kl_seen = 0.0;
        let informative = advantages.iter().any(|a| a.abs() > 0.0);
        if informative {
            let ids = pad(rows.clone());
            let seq = ids[0].len();
            let mut weight = vec![0f32; rows.len() * (seq - 1)];
            let mut old_flat = vec![0f32; rows.len() * (seq - 1)];
            let mut advantage_flat = vec![0f32; rows.len() * (seq - 1)];
            for (row, sequence) in rows.iter().enumerate() {
                let from = prompts[row / GROUP].len();
                for target in from..sequence.len() {
                    let at = row * (seq - 1) + target - 1;
                    weight[at] = 1.0;
                    old_flat[at] = old[row][target - from];
                    advantage_flat[at] = advantages[row];
                }
            }
            let device = self.model.device().clone();
            let shape = (rows.len(), seq - 1);
            let weight_t = Tensor::from_vec(weight.clone(), shape, &device)?;
            let old_t = Tensor::from_vec(old_flat, shape, &device)?;
            let advantage_t = Tensor::from_vec(advantage_flat, shape, &device)?;
            let count = weight.iter().sum::<f32>() as f64;
            let reference = {
                let frozen = self.reference.as_ref().expect("frozen above");
                let out = frozen.forward(&ids, 0, None, &mut |s| control.check(s))?;
                token_log_probabilities(&out.logits, &ids)?.detach()
            };
            for epoch in 0..RL_EPOCHS {
                control.check(&format!("policy update {}", epoch + 1))?;
                let out = self
                    .model
                    .forward(&ids, 0, None, &mut |s| control.check(s))?;
                let log_p = token_log_probabilities(&out.logits, &ids)?;
                let ratio = (&log_p - &old_t)?.exp()?;
                let clipped = ratio.clamp(1.0 - RL_CLIP, 1.0 + RL_CLIP)?;
                let surrogate = (&ratio * &advantage_t)?.minimum(&(clipped * &advantage_t)?)?;
                let gap = (&reference - &log_p)?;
                let kl = ((gap.exp()? - &gap)? - 1.0)?;
                let kl_mean = ((&kl * &weight_t)?.sum_all()? / count)?;
                let objective = ((&surrogate * &weight_t)?.sum_all()? / count)?;
                let loss = ((kl_mean.clone() * RL_KL)? - objective)?;
                let total = (&loss + &out.indexer_loss)?;
                kl_seen = kl_mean.to_scalar::<f32>()?;
                let step = self.apply(total, Phase::Rl, control, Some(out.load))?;
                report.loss = step.loss;
                report.grad_norm = step.grad_norm;
                report.clipped |= step.clipped;
                report.committed |= step.committed;
                if step.committed {
                    self.phase_steps.rl += 1;
                }
            }
        }

        let after = if report.committed {
            let out = self
                .model
                .forward(&[prompts[0].clone()], 0, None, &mut |s| control.check(s))?;
            Some(
                softmax(&out.logits, D::Minus1)?.to_vec3::<f32>()?[0][prompts[0].len() - 1].clone(),
            )
        } else {
            None
        };
        let samples = (0..GROUP)
            .map(|i| {
                let first = rows[i][prompts[0].len()] as usize;
                RolloutSample {
                    answer: answers[i].clone(),
                    reward: rewards[i],
                    advantage: advantages[i],
                    probability: old[i][0].exp(),
                    probability_after: after.as_ref().map(|p| p[first]),
                }
            })
            .collect();
        let view = RolloutView {
            operation_id,
            step: self.step,
            revision: self.revision,
            code: examples[0].code.clone(),
            question: examples[0].question.clone(),
            truth: examples[0].answer.clone(),
            samples,
            mean_reward: rewards.iter().sum::<f32>() / rewards.len() as f32,
            updated: report.committed,
            kl: kl_seen,
        };
        Ok((report, view))
    }

    pub fn begin_distillation(&mut self) -> Result<()> {
        self.teacher = Some(self.model.frozen_copy()?);
        if self.student.is_none() {
            let model = Model::new(Config::student(self.model.cfg.vocab), self.rng.0 | 1)?;
            let opt = optimizer(&model, Phase::Distill.learning_rate())?;
            self.student = Some(Student { model, opt });
        }
        Ok(())
    }

    pub fn release_teacher(&mut self) {
        self.teacher = None;
    }

    pub fn distillation_step(&mut self, control: &mut dyn Control) -> Result<StepReport> {
        let (examples, rows, answers) = self.batch(false)?;
        let mut rows: Vec<Vec<u32>> = rows
            .into_iter()
            .zip(&answers)
            .map(|(ids, &at)| ids[..at].to_vec())
            .collect();
        let mut open = vec![true; rows.len()];
        let mut rng = self.rng.clone();
        let (Some(student), Some(teacher)) = (self.student.as_mut(), self.teacher.as_ref()) else {
            anyhow::bail!("distillation has no teacher");
        };
        for token in 0..ANSWER_TOKENS {
            control.check(&format!("student rollout · token {}", token + 1))?;
            let lengths: Vec<usize> = rows.iter().map(Vec::len).collect();
            let out = student
                .model
                .forward(&pad(rows.clone()), 0, None, &mut |s| control.check(s))?;
            let probabilities = softmax(&out.logits, D::Minus1)?.to_vec3::<f32>()?;
            for (row, sequence) in rows.iter_mut().enumerate() {
                if open[row] {
                    let pick = sample(&probabilities[row][lengths[row] - 1], &mut rng);
                    sequence.push(pick as u32);
                    open[row] = pick as u32 != EOS;
                }
            }
        }
        let lengths: Vec<usize> = rows.iter().map(Vec::len).collect();
        let ids = pad(rows);
        let seq = ids[0].len();
        let mut weight = vec![0f32; ids.len() * seq];
        for (row, &len) in lengths.iter().enumerate() {
            for position in 0..len - 1 {
                weight[row * seq + position] = 1.0;
            }
        }
        let count = weight.iter().sum::<f32>() as f64;
        let weight = Tensor::from_vec(weight, (ids.len(), seq), teacher.device())?;
        control.check("teacher forward")?;
        let target = teacher.forward(&ids, 0, None, &mut |s| control.check(s))?;
        let teacher_log = log_softmax(&target.logits, D::Minus1)?.detach();
        let out = student
            .model
            .forward(&ids, 0, None, &mut |s| control.check(s))?;
        let student_log = log_softmax(&out.logits, D::Minus1)?;
        let divergence = (teacher_log.exp()? * (&teacher_log - &student_log)?)?.sum(D::Minus1)?;
        let loss = ((divergence * weight)?.sum_all()? / count)?;
        let total = (&loss + &out.indexer_loss)?;

        control.check("backward")?;
        let mut grads = total.backward()?;
        control.check("optimizer preparation")?;
        let (grad_norm, clipped) = clip(&student.model, &mut grads)?;
        let value = loss.to_scalar::<f32>()?;
        let mut committed = false;
        if value.is_finite() && grad_norm.is_finite() {
            let load = out.load;
            let Student { model, opt } = student;
            let (done, revision) = (self.phase_steps.distill + 1, self.revision);
            committed = control.commit(&mut || {
                opt.step(&grads)?;
                model.rebalance(&load);
                Ok((done, revision))
            })?;
        } else {
            self.numerical_failures += 1;
        }
        self.rng = rng;
        if committed {
            self.phase_steps.distill += 1;
        }
        Ok(StepReport {
            loss: value,
            grad_norm,
            clipped,
            committed,
            reading: examples.iter().map(Example::prompt).collect(),
            auxiliary: AuxiliaryView::default(),
        })
    }

    pub fn distillation_view(
        &self,
        operation_id: uuid::Uuid,
        divergence: f32,
    ) -> Result<DistillView> {
        let (Some(student), Some(teacher)) = (self.student.as_ref(), self.teacher.as_ref()) else {
            anyhow::bail!("distillation has no teacher");
        };
        let ours = answers(&student.model, &self.vocab, &self.evaluation)?;
        let theirs = answers(teacher, &self.vocab, &self.evaluation)?;
        let total = self.evaluation.len() as f32;
        let right = |given: &[u32]| {
            given
                .iter()
                .zip(&self.evaluation)
                .filter(|(id, e)| self.vocab.words[**id as usize] == e.answer)
                .count() as f32
                / total
        };
        Ok(DistillView {
            operation_id,
            step: self.phase_steps.distill,
            divergence,
            teacher_accuracy: right(&theirs),
            student_accuracy: right(&ours),
            agreement: ours.iter().zip(&theirs).filter(|(a, b)| a == b).count() as f32 / total,
            teacher_parameters: teacher.parameter_count(),
            student_parameters: student.model.parameter_count(),
        })
    }

    pub fn generate(
        &mut self,
        operation_id: uuid::Uuid,
        control: &mut dyn Control,
        emit: &mut dyn FnMut(TokenEvent),
    ) -> Result<()> {
        let revision = self.revision;
        let mut ids = self.specimen.ids.clone();
        let mut text = Vec::new();
        for index in 0..ANSWER_TOKENS {
            control.check(&format!("decode · token {}", index + 1))?;
            let out = self
                .model
                .forward(&[ids.clone()], 0, None, &mut |s| control.check(s))?;
            let distribution =
                softmax(&out.logits, D::Minus1)?.to_vec3::<f32>()?[0][ids.len() - 1].clone();
            let ranked = top(&distribution, 5);
            let (pick, probability) = ranked[0];
            ids.push(pick as u32);
            let done = pick as u32 == EOS || index + 1 == ANSWER_TOKENS;
            if pick as u32 != EOS {
                text.push(pick as u32);
            }
            let answer = self.answer_text(&text);
            emit(TokenEvent {
                operation_id,
                index,
                text: self.word(pick as u32),
                probability,
                alternatives: self.candidates(&ranked),
                done,
                truth: done.then(|| self.specimen.truth.clone()).flatten(),
                correct: done
                    .then(|| self.specimen.truth.as_ref().map(|t| *t == answer))
                    .flatten(),
            });
            if done {
                break;
            }
        }
        debug_assert_eq!(
            revision, self.revision,
            "generation must not move the weights"
        );
        Ok(())
    }

    pub fn dream(&mut self) -> Result<DreamView> {
        const LIMIT: usize = 16;
        let mut ids = vec![BOS];
        let mut tokens = Vec::new();
        while tokens.len() < LIMIT {
            let mut row = ids.clone();
            row.resize(ids.len().max(2), PAD);
            let out = self
                .model
                .forward(&[row], 0, None, &mut crate::model::unchecked)?;
            let distribution =
                softmax(&out.logits, D::Minus1)?.to_vec3::<f32>()?[0][ids.len() - 1].clone();
            let pick = sample(&distribution, &mut self.dream_rng);
            if pick as u32 == EOS {
                break;
            }
            tokens.push(Candidate {
                text: self.word(pick as u32),
                probability: distribution[pick],
            });
            ids.push(pick as u32);
        }
        let written = self.vocab.decode(&ids[1..]);
        let well_formed = ids.len() > 1 && ids[1..].iter().all(|&id| id > ANSWER);
        let compiles = well_formed
            && ["x", "y", "z"]
                .iter()
                .any(|binding| evaluate(&written, binding).is_ok());
        Ok(DreamView {
            step: self.step,
            tokens,
            compiles,
        })
    }

    pub fn probe(&mut self) -> Result<ProbeView> {
        self.probe_at(Instant::now())
    }

    fn probe_at(&mut self, now: Instant) -> Result<ProbeView> {
        let mut rows = Vec::new();
        let mut answer_at = Vec::new();
        for example in self.evaluation.iter().chain(&self.cards) {
            let (ids, at) = example.sequence(&self.vocab, false)?;
            rows.push(ids);
            answer_at.push(at);
        }
        let specimen_row = rows.len();
        rows.push(self.specimen.ids.clone());
        let focus = self.focus.min(self.specimen.ids.len() - 1);
        let ids = pad(rows.clone());
        let out = self.model.forward(
            &ids,
            0,
            Some(TraceRequest {
                row: specimen_row,
                position: focus,
            }),
            &mut crate::model::unchecked,
        )?;
        let probabilities = softmax(&out.logits, D::Minus1)?.to_vec3::<f32>()?;

        let mut held_out_loss = 0.0;
        let mut graded = 0usize;
        let mut families: Vec<FamilyScore> = Vec::new();
        let mut correct_total = 0;
        for (row, example) in self.evaluation.iter().enumerate() {
            if example.family.compiles() {
                let code_end = 1 + self.vocab.encode(&example.code)?.len();
                for target in 1..code_end {
                    held_out_loss -= probabilities[row][target - 1][rows[row][target] as usize]
                        .max(1e-9)
                        .ln();
                    graded += 1;
                }
            }
            let guess = top(&probabilities[row][answer_at[row] - 1], 1)[0].0;
            let correct = self.vocab.words[guess] == example.answer;
            correct_total += correct as usize;
            match families.iter_mut().find(|f| f.family == example.family) {
                Some(score) => {
                    score.total += 1;
                    score.correct += correct as usize;
                }
                None => families.push(FamilyScore {
                    family: example.family,
                    label: example.family.label().into(),
                    correct: correct as usize,
                    total: 1,
                }),
            }
        }
        let cards = self
            .cards
            .iter()
            .enumerate()
            .map(|(i, example)| {
                let row = self.evaluation.len() + i;
                let distribution = &probabilities[row][answer_at[row] - 1];
                let (guess, probability) = top(distribution, 1)[0];
                let truth_id = self.vocab.words.iter().position(|w| *w == example.answer);
                CardView {
                    family: example.family,
                    label: example.family.label().into(),
                    code: example.code.clone(),
                    question: example.question.clone(),
                    truth: example.answer.clone(),
                    answer: self.word(guess as u32),
                    probability,
                    truth_probability: truth_id.map(|id| distribution[id]).unwrap_or(0.0),
                    correct: self.vocab.words[guess] == example.answer,
                }
            })
            .collect();

        let specimen = &self.specimen;
        let code_end = 1 + self.vocab.encode(&specimen.code)?.len();
        let tokens = specimen
            .ids
            .iter()
            .enumerate()
            .map(|(t, &id)| {
                let (probability, rank) = if t == 0 {
                    (1.0, 0)
                } else {
                    let before = &probabilities[specimen_row][t - 1];
                    let p = before[id as usize];
                    (p, before.iter().filter(|&&other| other > p).count())
                };
                LineToken {
                    text: self.word(id),
                    id,
                    role: match t {
                        0 => "start",
                        t if t < code_end => "code",
                        t if t + 1 == specimen.ids.len() => "marker",
                        _ => "question",
                    }
                    .into(),
                    probability,
                    rank,
                }
            })
            .collect();
        let answer = self.candidates(&top(
            &probabilities[specimen_row][specimen.ids.len() - 1],
            5,
        ));
        let next = self.candidates(&top(&probabilities[specimen_row][focus], 5));
        let trace = out.trace.unwrap_or_default();
        let engram = self.engram_traces(&trace);
        // Autoregressive samples cost up to 16 forward passes. Keep their
        // cadence independent of the frequent prediction/focus probes, and
        // don't regenerate samples when only the selected token changes.
        let dream_due = self.last_dream.is_none_or(|(revision, at)| {
            revision != self.revision && now.duration_since(at) >= DREAM_INTERVAL
        });
        let dream = if self.dreaming && dream_due {
            let dream = self.dream()?;
            self.last_dream = Some((self.revision, now));
            Some(dream)
        } else {
            None
        };
        let examples = std::iter::once(&self.home)
            .chain(&self.cards)
            .map(|e| ExampleView {
                label: e.family.label().into(),
                code: e.code.clone(),
                question: e.question.clone(),
            })
            .collect();
        let specimen = &self.specimen;
        let view = ProbeView {
            step: self.step,
            revision: self.revision,
            held_out_loss: held_out_loss / graded.max(1) as f32,
            accuracy: correct_total as f32 / self.evaluation.len() as f32,
            evaluated: self.evaluation.len(),
            families,
            line: LineView {
                source: specimen.source.clone(),
                code: specimen.code.clone(),
                question: specimen.question.clone(),
                truth: specimen.truth.clone(),
                note: specimen.note.clone(),
                tokens,
                answer,
            },
            cards,
            focus: FocusView {
                position: focus,
                token: self.word(specimen.ids[focus]),
                next,
                distribution: probabilities[specimen_row][focus].clone(),
                layers: self.layer_traces(&trace),
                engram,
                cache: self.cache(specimen.ids.len()),
            },
            moved: self.moved()?,
            dream,
            examples,
        };
        Ok(view)
    }

    fn layer_traces(&self, trace: &Trace) -> Vec<LayerTrace> {
        let cfg = &self.model.cfg;
        trace
            .layers
            .iter()
            .enumerate()
            .map(|(layer, record)| LayerTrace {
                layer,
                stack: stack(cfg, layer).into(),
                mode: cfg.schedule[layer].as_str().into(),
                tokens: record.tokens.clone(),
                blocks: record
                    .blocks
                    .iter()
                    .map(|b| BlockTrace {
                        start: b.start,
                        end: b.end,
                        weight: b.weight,
                        score: b.score,
                        selected: b.selected,
                        visible: b.visible,
                    })
                    .collect(),
                experts: record
                    .experts
                    .iter()
                    .enumerate()
                    .map(|(expert, &(score, weight, chosen))| ExpertTrace {
                        expert,
                        score,
                        weight,
                        chosen,
                    })
                    .collect(),
                mixing: record.mixing.clone(),
            })
            .collect()
    }

    fn engram_traces(&mut self, trace: &Trace) -> Vec<EngramTrace> {
        let cfg = self.model.cfg.clone();
        trace
            .engram
            .iter()
            .map(|record| {
                let lookup = cfg
                    .engram_orders
                    .iter()
                    .position(|&o| o == record.order)
                    .unwrap_or(0)
                    * cfg.engram_heads
                    + record.head;
                let first = self
                    .seen
                    .entry((record.layer, lookup, record.bucket))
                    .or_insert_with(|| record.tokens.clone());
                let collides_with = (*first != record.tokens).then(|| self.vocab.decode_all(first));
                EngramTrace {
                    layer: record.layer,
                    ngram: self.vocab.decode_all(&record.tokens),
                    order: record.order,
                    bucket: record.bucket,
                    gate: record.gate,
                    collides_with,
                }
            })
            .collect()
    }

    pub fn remember(&mut self, rows: &[Vec<u32>]) {
        let cfg = self.model.cfg.clone();
        for sequence in rows {
            for t in 0..sequence.len() {
                for (o, &order) in cfg.engram_orders.iter().enumerate() {
                    if t + 1 < order {
                        continue;
                    }
                    let tokens = &sequence[t + 1 - order..=t];
                    for &layer in &cfg.engram_layers {
                        for head in 0..cfg.engram_heads {
                            let lookup = o * cfg.engram_heads + head;
                            if let Some(bucket) = self.model.engram_bucket(layer, tokens, lookup) {
                                self.seen
                                    .entry((layer, lookup, bucket))
                                    .or_insert_with(|| tokens.to_vec());
                            }
                        }
                    }
                }
            }
        }
    }

    fn cache(&self, tokens: usize) -> CacheView {
        let cfg = &self.model.cfg;
        let float = 4;
        let mut bytes = 0;
        let mut owners = Vec::new();
        for (layer, mode) in cfg.schedule.iter().enumerate() {
            bytes += tokens.min(cfg.window) * cfg.head_dim * float;
            if *mode == crate::model::Mode::Full {
                bytes += tokens / cfg.ratio(layer) * (cfg.head_dim + cfg.index_dim) * float;
                owners.push(format!("block {}", layer + 1));
            }
        }
        CacheView {
            tokens,
            bytes,
            dense_bytes: cfg.layers() * tokens * 2 * cfg.heads * cfg.head_dim * float,
            global_owner: owners.join(" · "),
        }
    }

    fn moved(&mut self) -> Result<Vec<GroupDelta>> {
        let now = self.model.groups()?;
        let deltas = now
            .iter()
            .zip(&self.baseline)
            .map(|((group, new), (_, old))| {
                let change: f32 = new.iter().zip(old).map(|(a, b)| (a - b).powi(2)).sum();
                let size: f32 = old.iter().map(|b| b * b).sum();
                GroupDelta {
                    group: group.clone(),
                    parameters: new.len(),
                    relative_change: (change / size.max(1e-12)).sqrt(),
                }
            })
            .collect();
        self.baseline = now;
        Ok(deltas)
    }

    fn word(&self, id: u32) -> String {
        match id {
            PAD => "·".into(),
            BOS => "start".into(),
            EOS => "end".into(),
            ANSWER => "→".into(),
            id => self
                .vocab
                .words
                .get(id as usize)
                .cloned()
                .unwrap_or_default(),
        }
    }

    fn answer_text(&self, ids: &[u32]) -> String {
        let words: Vec<String> = ids
            .iter()
            .take_while(|&&id| id != EOS)
            .map(|&id| self.word(id))
            .collect();
        words.join(" ")
    }

    fn candidates(&self, ranked: &[(usize, f32)]) -> Vec<Candidate> {
        ranked
            .iter()
            .map(|&(id, probability)| Candidate {
                text: self.word(id as u32),
                probability,
            })
            .collect()
    }
}

fn stack(cfg: &Config, layer: usize) -> &'static str {
    if layer < cfg.encoder_layers {
        "encoder"
    } else {
        "decoder"
    }
}

fn pad(mut rows: Vec<Vec<u32>>) -> Vec<Vec<u32>> {
    let seq = rows.iter().map(Vec::len).max().unwrap_or(0);
    for row in &mut rows {
        row.resize(seq, PAD);
    }
    rows
}

fn mean_load(per_layer: &[Vec<f32>]) -> Vec<f32> {
    let Some(first) = per_layer.first() else {
        return Vec::new();
    };
    (0..first.len())
        .map(|e| per_layer.iter().map(|l| l[e]).sum::<f32>() / per_layer.len() as f32)
        .collect()
}

fn token_log_probabilities(logits: &Tensor, ids: &[Vec<u32>]) -> Result<Tensor> {
    let (batch, seq, _) = logits.dims3()?;
    let targets: Vec<u32> = ids
        .iter()
        .flat_map(|row| row[1..].iter().copied())
        .collect();
    let targets = Tensor::from_vec(targets, (batch, seq - 1, 1), logits.device())?;
    Ok(log_softmax(&logits.narrow(1, 0, seq - 1)?, D::Minus1)?
        .gather(&targets, 2)?
        .squeeze(2)?)
}

fn masked_nll(logits: &Tensor, ids: &[Vec<u32>], weight: &[f32]) -> Result<Tensor> {
    let log_p = token_log_probabilities(logits, ids)?;
    let count = weight.iter().sum::<f32>().max(1.0) as f64;
    let weight = Tensor::from_vec(weight.to_vec(), log_p.dims(), logits.device())?;
    Ok(((log_p * weight)?.sum_all()?.neg()? / count)?)
}

fn clip(model: &Model, grads: &mut GradStore) -> Result<(f32, bool)> {
    let mut total = 0f32;
    for (_, var) in &model.params.vars {
        if let Some(grad) = grads.get(var.as_tensor()) {
            total += grad.sqr()?.sum_all()?.to_scalar::<f32>()?;
        }
    }
    let norm = total.sqrt();
    let clipped = norm.is_finite() && norm > CLIP;
    if clipped {
        let scale = (CLIP / norm) as f64;
        for (_, var) in &model.params.vars {
            if let Some(grad) = grads.remove(var.as_tensor()) {
                grads.insert(var.as_tensor(), (grad * scale)?);
            }
        }
    }
    Ok((norm, clipped))
}

fn top(distribution: &[f32], k: usize) -> Vec<(usize, f32)> {
    let mut order: Vec<usize> = (0..distribution.len()).collect();
    order.sort_by(|&a, &b| distribution[b].total_cmp(&distribution[a]));
    order
        .into_iter()
        .take(k)
        .map(|i| (i, distribution[i]))
        .collect()
}

fn sample(distribution: &[f32], rng: &mut Rng) -> usize {
    let mut remaining = rng.uniform() as f32 * distribution.iter().sum::<f32>();
    for (i, p) in distribution.iter().enumerate() {
        remaining -= p;
        if remaining <= 0.0 {
            return i;
        }
    }
    distribution.len() - 1
}

fn answers(model: &Model, vocab: &Vocabulary, examples: &[Example]) -> Result<Vec<u32>> {
    let mut rows = Vec::new();
    let mut answer_at = Vec::new();
    for example in examples {
        let (ids, at) = example.sequence(vocab, false)?;
        rows.push(ids);
        answer_at.push(at);
    }
    let out = model.forward(&pad(rows), 0, None, &mut crate::model::unchecked)?;
    let picks = out.logits.argmax(D::Minus1)?.to_vec2::<u32>()?;
    Ok(picks
        .iter()
        .zip(answer_at)
        .map(|(row, at)| row[at - 1])
        .collect())
}

pub fn interrupted(error: &anyhow::Error) -> bool {
    error.downcast_ref::<Interrupted>().is_some()
}

pub fn check_snippet(code: &str, question: &str) -> Result<()> {
    let vocab = Vocabulary::default();
    let code_len = vocab.encode(code)?.len();
    anyhow::ensure!(code_len > 0, "Write a line of Rust first.");
    let question_len = vocab.encode(question)?.len();
    anyhow::ensure!(
        2 + code_len + question_len + ANSWER_TOKENS <= 48,
        "That snippet is too long for a 48-token line."
    );
    let words: Vec<&str> = question.split_whitespace().collect();
    anyhow::ensure!(
        matches!(
            words.as_slice(),
            ["value", "of", _, "?"] | ["valid", "reassignment", "?"]
        ),
        "Ask either \"value of x ?\" or \"valid reassignment ?\"."
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probes_stay_fresh_while_generated_samples_are_rate_limited() {
        let mut brain = Brain::new(3).unwrap();
        let now = Instant::now();
        assert!(brain.probe_at(now).unwrap().dream.is_some());

        brain
            .language_step(Phase::Pretrain, &mut Unattended)
            .unwrap();
        brain.set_focus(1);
        let fresh = brain.probe_at(now + Duration::from_millis(450)).unwrap();
        assert_eq!(fresh.revision, 1);
        assert_eq!(fresh.focus.position, 1);
        assert!(fresh.dream.is_none());

        let sampled = brain.probe_at(now + DREAM_INTERVAL).unwrap();
        assert_eq!(sampled.dream.unwrap().step, 1);

        brain.set_focus(2);
        let idle = brain.probe_at(now + DREAM_INTERVAL * 2).unwrap();
        assert_eq!(idle.focus.position, 2);
        assert!(idle.dream.is_none(), "focus changes must not resample");

        brain.dreaming = false;
        brain.language_step(Phase::Sft, &mut Unattended).unwrap();
        assert!(brain
            .probe_at(now + DREAM_INTERVAL * 3)
            .unwrap()
            .dream
            .is_none());

        brain.dreaming = true;
        assert_eq!(
            brain
                .probe_at(now + DREAM_INTERVAL * 4)
                .unwrap()
                .dream
                .unwrap()
                .step,
            2
        );
    }
}
