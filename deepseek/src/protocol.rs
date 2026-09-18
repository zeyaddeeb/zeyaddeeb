use crate::curriculum::Family;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const PROTOCOL_VERSION: u8 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Pretrain,
    Sft,
    Rl,
    Distill,
    Generate,
}

impl Phase {
    pub fn learning_rate(self) -> f64 {
        match self {
            Self::Pretrain | Self::Distill => 1e-3,
            Self::Sft => 5e-4,
            Self::Rl => 1e-4,
            Self::Generate => 0.0,
        }
    }
    pub fn default_steps(self) -> u32 {
        match self {
            Self::Pretrain => 400,
            Self::Sft => 400,
            Self::Rl => 120,
            Self::Distill => 300,
            Self::Generate => 1,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ClientCommand {
    Start {
        command_id: Uuid,
        generation: u64,
        phase: Phase,
        steps: Option<u32>,
    },
    Pause {
        command_id: Uuid,
        generation: u64,
    },
    Resume {
        command_id: Uuid,
        generation: u64,
    },
    Cancel {
        command_id: Uuid,
        generation: u64,
        operation_id: Option<Uuid>,
    },
    Reset {
        command_id: Uuid,
        generation: u64,
    },
    Focus {
        command_id: Uuid,
        generation: u64,
        position: usize,
    },
    Show {
        command_id: Uuid,
        generation: u64,
        code: String,
        question: String,
    },
    Ask {
        command_id: Uuid,
        generation: u64,
        code: String,
        question: String,
    },
}

impl ClientCommand {
    pub fn ids(&self) -> (Uuid, u64) {
        match self {
            Self::Start {
                command_id,
                generation,
                ..
            }
            | Self::Pause {
                command_id,
                generation,
            }
            | Self::Resume {
                command_id,
                generation,
            }
            | Self::Cancel {
                command_id,
                generation,
                ..
            }
            | Self::Reset {
                command_id,
                generation,
            }
            | Self::Focus {
                command_id,
                generation,
                ..
            }
            | Self::Show {
                command_id,
                generation,
                ..
            }
            | Self::Ask {
                command_id,
                generation,
                ..
            } => (*command_id, *generation),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub v: u8,
    pub seq: u64,
    pub generation: u64,
    #[serde(flatten)]
    pub event: ServerEvent,
}

#[derive(Clone, Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ServerEvent {
    Snapshot {
        session: Box<SessionView>,
    },
    Lifecycle {
        operation: OperationView,
    },
    Step(StepView),
    Probe(Box<ProbeView>),
    Rollout(RolloutView),
    Token(TokenEvent),
    Distill(DistillView),
    Error {
        command_id: Option<Uuid>,
        code: String,
        message: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub id: Uuid,
    pub generation: u64,
    pub model: ModelInfo,
    pub step: u64,
    pub revision: u64,
    pub phase_steps: PhaseSteps,
    pub operation: Option<OperationView>,
    pub probe: Option<ProbeView>,
    pub curve: Vec<CurvePoint>,
    pub evaluations: Vec<EvaluationPoint>,
    pub dreams: Vec<DreamView>,
    pub rollout: Option<RolloutView>,
    pub distill: Option<DistillView>,
    pub journal: Vec<JournalEntry>,
    pub workers: WorkerView,
}

#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseSteps {
    pub pretrain: u64,
    pub sft: u64,
    pub rl: u64,
    pub distill: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerView {
    pub capacity: usize,
    pub busy: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub parameters: usize,
    pub student_parameters: usize,
    pub vocab_size: usize,
    pub hidden: usize,
    pub heads: usize,
    pub encoder_layers: usize,
    pub decoder_layers: usize,
    pub experts: usize,
    pub active_experts: usize,
    pub expert_width: usize,
    pub residual_streams: usize,
    pub window: usize,
    pub compression: usize,
    pub top_blocks: usize,
    pub engram_buckets: usize,
    pub schedule: Vec<LayerInfo>,
    pub device: String,
    pub uniform_loss: f32,
    pub vocabulary: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerInfo {
    pub layer: usize,
    pub stack: String,
    pub mode: String,
    pub engram: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationView {
    pub operation_id: Uuid,
    pub command_id: Uuid,
    pub phase: Phase,
    pub state: String,
    pub stage: String,
    pub progress: f32,
    pub steps_done: u32,
    pub steps_total: u32,
    pub retained_step: u64,
    pub retained_revision: u64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub operation_id: Uuid,
    pub at_ms: u64,
    pub state: String,
    pub stage: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurvePoint {
    pub step: u64,
    pub phase: Phase,
    pub loss: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvaluationPoint {
    pub step: u64,
    pub phase: Phase,
    pub held_out_loss: f32,
    pub accuracy: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepView {
    pub operation_id: Uuid,
    pub phase: Phase,
    pub step: u64,
    pub revision: u64,
    pub phase_steps: PhaseSteps,
    pub losses: Vec<f32>,
    pub grad_norm: f32,
    pub clipped: bool,
    pub learning_rate: f64,
    pub step_ms: f32,
    pub reading: Vec<String>,
    pub auxiliary: AuxiliaryView,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuxiliaryView {
    pub indexer_loss: f32,
    pub expert_load: Vec<f32>,
    pub router_bias: Vec<f32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeView {
    pub step: u64,
    pub revision: u64,
    pub held_out_loss: f32,
    pub accuracy: f32,
    pub evaluated: usize,
    pub families: Vec<FamilyScore>,
    pub line: LineView,
    pub cards: Vec<CardView>,
    pub focus: FocusView,
    pub moved: Vec<GroupDelta>,
    pub dream: Option<DreamView>,
    pub examples: Vec<ExampleView>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DreamView {
    pub step: u64,
    pub tokens: Vec<Candidate>,
    pub compiles: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExampleView {
    pub label: String,
    pub code: String,
    pub question: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilyScore {
    pub family: Family,
    pub label: String,
    pub correct: usize,
    pub total: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineView {
    pub source: String,
    pub code: String,
    pub question: String,
    pub truth: Option<String>,
    pub note: Option<String>,
    pub tokens: Vec<LineToken>,
    pub answer: Vec<Candidate>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineToken {
    pub text: String,
    pub id: u32,
    pub role: String,
    pub probability: f32,
    pub rank: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub text: String,
    pub probability: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardView {
    pub family: Family,
    pub label: String,
    pub code: String,
    pub question: String,
    pub truth: String,
    pub answer: String,
    pub probability: f32,
    pub truth_probability: f32,
    pub correct: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusView {
    pub position: usize,
    pub token: String,
    pub next: Vec<Candidate>,
    pub distribution: Vec<f32>,
    pub layers: Vec<LayerTrace>,
    pub engram: Vec<EngramTrace>,
    pub cache: CacheView,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerTrace {
    pub layer: usize,
    pub stack: String,
    pub mode: String,
    pub tokens: Vec<f32>,
    pub blocks: Vec<BlockTrace>,
    pub experts: Vec<ExpertTrace>,
    pub mixing: Vec<Vec<f32>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockTrace {
    pub start: usize,
    pub end: usize,
    pub weight: f32,
    pub score: f32,
    pub selected: bool,
    pub visible: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpertTrace {
    pub expert: usize,
    pub score: f32,
    pub weight: f32,
    pub chosen: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngramTrace {
    pub layer: usize,
    pub ngram: String,
    pub order: usize,
    pub bucket: usize,
    pub gate: f32,
    pub collides_with: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheView {
    pub tokens: usize,
    pub bytes: usize,
    pub dense_bytes: usize,
    pub global_owner: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupDelta {
    pub group: String,
    pub parameters: usize,
    pub relative_change: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutView {
    pub operation_id: Uuid,
    pub step: u64,
    pub revision: u64,
    pub code: String,
    pub question: String,
    pub truth: String,
    pub samples: Vec<RolloutSample>,
    pub mean_reward: f32,
    pub updated: bool,
    pub kl: f32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RolloutSample {
    pub answer: String,
    pub reward: f32,
    pub advantage: f32,
    pub probability: f32,
    pub probability_after: Option<f32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenEvent {
    pub operation_id: Uuid,
    pub index: usize,
    pub text: String,
    pub probability: f32,
    pub alternatives: Vec<Candidate>,
    pub done: bool,
    pub truth: Option<String>,
    pub correct: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistillView {
    pub operation_id: Uuid,
    pub step: u64,
    pub divergence: f32,
    pub teacher_accuracy: f32,
    pub student_accuracy: f32,
    pub agreement: f32,
    pub teacher_parameters: usize,
    pub student_parameters: usize,
}
