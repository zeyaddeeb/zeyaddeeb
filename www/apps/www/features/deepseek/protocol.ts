export type Phase = "pretrain" | "sft" | "rl" | "distill" | "generate";

export type OperationState =
	| "queued"
	| "running"
	| "paused"
	| "cancelRequested"
	| "compensating"
	| "completed"
	| "canceled"
	| "failed";

export interface OperationView {
	operationId: string;
	commandId: string;
	phase: Phase;
	state: OperationState;
	stage: string;
	progress: number;
	stepsDone: number;
	stepsTotal: number;
	retainedStep: number;
	retainedRevision: number;
	error: string | null;
}

export interface LayerInfo {
	layer: number;
	stack: "encoder" | "decoder";
	mode: "SWA" | "Full" | "Reindex" | "Reuse";
	engram: boolean;
}

export interface ModelInfo {
	parameters: number;
	studentParameters: number;
	vocabSize: number;
	hidden: number;
	heads: number;
	encoderLayers: number;
	decoderLayers: number;
	experts: number;
	activeExperts: number;
	expertWidth: number;
	residualStreams: number;
	window: number;
	compression: number;
	topBlocks: number;
	engramBuckets: number;
	schedule: LayerInfo[];
	device: string;
	uniformLoss: number;
	vocabulary: string[];
}

export interface Candidate {
	text: string;
	probability: number;
}

export interface LineToken {
	text: string;
	id: number;
	role: "start" | "code" | "question" | "marker";
	probability: number;
	rank: number;
}

export interface LineView {
	source: "heldOut" | "visitor";
	code: string;
	question: string;
	truth: string | null;
	note: string | null;
	tokens: LineToken[];
	answer: Candidate[];
}

export interface CardView {
	family: string;
	label: string;
	code: string;
	question: string;
	truth: string;
	answer: string;
	probability: number;
	truthProbability: number;
	correct: boolean;
}

export interface BlockTrace {
	start: number;
	end: number;
	weight: number;
	score: number;
	selected: boolean;
	visible: boolean;
}

export interface ExpertTrace {
	expert: number;
	score: number;
	weight: number;
	chosen: boolean;
}

export interface LayerTrace {
	layer: number;
	stack: "encoder" | "decoder";
	mode: LayerInfo["mode"];
	tokens: number[];
	blocks: BlockTrace[];
	experts: ExpertTrace[];
	mixing: number[][];
}

export interface EngramTrace {
	layer: number;
	ngram: string;
	order: number;
	bucket: number;
	gate: number;
	collidesWith: string | null;
}

export interface FocusView {
	position: number;
	token: string;
	next: Candidate[];
	distribution: number[];
	layers: LayerTrace[];
	engram: EngramTrace[];
	cache: {
		tokens: number;
		bytes: number;
		denseBytes: number;
		globalOwner: string;
	};
}

export interface FamilyScore {
	family: string;
	label: string;
	correct: number;
	total: number;
}

export interface GroupDelta {
	group: string;
	parameters: number;
	relativeChange: number;
}

export interface DreamView {
	step: number;
	tokens: Candidate[];
	compiles: boolean;
}

export interface ExampleView {
	label: string;
	code: string;
	question: string;
}

export interface ProbeView {
	step: number;
	revision: number;
	heldOutLoss: number;
	accuracy: number;
	evaluated: number;
	families: FamilyScore[];
	line: LineView;
	cards: CardView[];
	focus: FocusView;
	moved: GroupDelta[];
	dream: DreamView | null;
	examples: ExampleView[];
}

export interface StepView {
	operationId: string;
	phase: Phase;
	step: number;
	revision: number;
	phaseSteps: SessionView["phaseSteps"];
	losses: number[];
	gradNorm: number;
	clipped: boolean;
	learningRate: number;
	stepMs: number;
	reading: string[];
	auxiliary: {
		indexerLoss: number;
		expertLoad: number[];
		routerBias: number[];
	};
}

export interface RolloutSample {
	answer: string;
	reward: number;
	advantage: number;
	probability: number;
	probabilityAfter: number | null;
}

export interface RolloutView {
	operationId: string;
	step: number;
	revision: number;
	code: string;
	question: string;
	truth: string;
	samples: RolloutSample[];
	meanReward: number;
	updated: boolean;
	kl: number;
}

export interface TokenEvent {
	operationId: string;
	index: number;
	text: string;
	probability: number;
	alternatives: Candidate[];
	done: boolean;
	truth: string | null;
	correct: boolean | null;
}

export interface DistillView {
	operationId: string;
	step: number;
	divergence: number;
	teacherAccuracy: number;
	studentAccuracy: number;
	agreement: number;
	teacherParameters: number;
	studentParameters: number;
}

export interface CurvePoint {
	step: number;
	phase: Phase;
	loss: number;
}

export interface EvaluationPoint {
	step: number;
	phase: Phase;
	heldOutLoss: number;
	accuracy: number;
}

export interface JournalEntry {
	operationId: string;
	atMs: number;
	state: OperationState;
	stage: string;
}

export interface SessionView {
	id: string;
	generation: number;
	model: ModelInfo;
	step: number;
	revision: number;
	phaseSteps: { pretrain: number; sft: number; rl: number; distill: number };
	operation: OperationView | null;
	probe: ProbeView | null;
	curve: CurvePoint[];
	evaluations: EvaluationPoint[];
	dreams: DreamView[];
	rollout: RolloutView | null;
	distill: DistillView | null;
	journal: JournalEntry[];
	workers: { capacity: number; busy: number };
}

interface Envelope {
	v: number;
	seq: number;
	generation: number;
}

export type ServerEvent = Envelope &
	(
		| { type: "snapshot"; session: SessionView }
		| { type: "lifecycle"; operation: OperationView }
		| ({ type: "step" } & StepView)
		| ({ type: "probe" } & ProbeView)
		| ({ type: "rollout" } & RolloutView)
		| ({ type: "token" } & TokenEvent)
		| ({ type: "distill" } & DistillView)
		| { type: "error"; commandId: string | null; code: string; message: string }
	);

export type Command =
	| { type: "start"; phase: Exclude<Phase, "generate">; steps?: number }
	| { type: "pause" }
	| { type: "resume" }
	| { type: "cancel"; operationId?: string }
	| { type: "reset" }
	| { type: "focus"; position: number }
	| { type: "show"; code: string; question: string }
	| { type: "ask"; code: string; question: string };

export const TERMINAL: OperationState[] = ["completed", "canceled", "failed"];
