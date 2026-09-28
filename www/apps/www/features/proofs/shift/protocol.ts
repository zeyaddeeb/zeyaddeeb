export type Trust =
	| "open"
	| "mathlib"
	| "literature"
	| "verified"
	| "measured"
	| "conjectured"
	| "refuted";

export type Kind =
	| "target"
	| "theorem"
	| "equivalence"
	| "conjecture"
	| "observation"
	| "insight"
	| "question";

export type Relation =
	| "implies"
	| "equivalent"
	| "uses"
	| "supports"
	| "refutes"
	| "analogy";

export interface Evidence {
	episode: number;
	tool: string;
	summary: string;
	held: boolean | null;
}

export interface BlueprintNode {
	key: string;
	kind: Kind;
	trust: Trust;
	title: string;
	body: string;
	lean: string | null;
	proof: string | null;
	source: string | null;
	front: string;
	episode: number;
	evidence: Evidence[];
	updated: number;
}

export interface Link {
	from: string;
	to: string;
	relation: Relation;
	episode: number;
}

export interface Verdict {
	field: string;
	op: string;
	value: number;
	observed: number;
	held: boolean;
	known?: string | null;
}

export interface Call {
	id: string;
	tool: string;
	args: Record<string, unknown>;
	ok: boolean;
	summary: string;
	verdict: Verdict | null;
	data: unknown;
}

export interface Turn {
	episode: number;
	index: number;
	thought: string;
	said: string;
	calls: Call[];
	tokens: number;
	at: number;
}

export interface Episode {
	number: number;
	front: string;
	objective: string;
	prediction: string;
	summary: string;
	next: string;
	reward: number;
	held: number;
	broken: number;
	verified: number;
	routine?: number;
	known?: number;
	turns: number;
	tokens: number;
	started: number;
	ended: number;
}

export interface Probe {
	sigmaFrom: number;
	sigmaTo: number;
	tFrom: number;
	tTo: number;
	zeros: number | null;
	episode: number;
}

export interface Lemma {
	name: string;
	code: string;
	node: string | null;
	episode: number;
	axioms: string[];
	routine?: boolean;
}

export interface Records {
	closestGap: number | null;
	gueDistance: number | null;
	robinDigits: number | null;
	robinMargin: number | null;
	mertensX: number | null;
	mertensRatio: number | null;
	hassePrimes: number | null;
}

export interface AgentState {
	awakeSince: number;
	episodes: number;
	tokens: number;
	frontier: number;
	zeros: number;
	missing: number;
	contours: number;
	predictions: number;
	held: number;
	broken: number;
	verified: number;
	routine?: number;
	known?: number;
	letter: string;
	lastFront: string;
	arms: { front: string; pulls: number; reward: number }[];
	records: Records;
	budget: { dayStart: number; spent: number; failures: number };
}

export interface Arm {
	front: string;
	pulls: number;
	mean: number;
	score: number | null;
}

export interface SearchStep {
	id: number;
	parent: number | null;
	tactic: string;
	source: "statement" | "automation" | "model";
	ok: boolean;
	goals: number;
	goal: string;
	error: string | null;
}

export type Channel = "think" | "say";
export type Phase = "work" | "sleep" | "rest";

export type Event =
	| { type: "wake"; episode: number; front: string; arms: Arm[] }
	| { type: "sleep"; after: number }
	| {
			type: "phase";
			phase: Phase;
			seconds: number | null;
			reason: string | null;
	  }
	| { type: "retry"; turn: number }
	| { type: "delta"; turn: number; channel: Channel; text: string }
	| {
			type: "call";
			turn: number;
			id: string;
			tool: string;
			args: Record<string, unknown>;
	  }
	| {
			type: "outcome";
			turn: number;
			id: string;
			tool: string;
			ok: boolean;
			summary: string;
			verdict: Verdict | null;
			data: unknown;
	  }
	| { type: "node"; node: BlueprintNode }
	| { type: "link"; link: Link }
	| { type: "search"; step: SearchStep }
	| { type: "concluded"; episode: Episode }
	| { type: "stats"; state: AgentState }
	| { type: "trouble"; message: string };

export type Envelope = Event & { seq: number; at: number };

export interface Front {
	id: string;
	title: string;
	question: string;
}

export interface Strip {
	frontier: number;
	bins: { from: number; to: number; zeros: number }[];
	recent: number[];
	closest: [number, number][];
	probes: Probe[];
}

export interface Calibration {
	name: string;
	expected: string;
	measured: string;
	passed: boolean;
}

export interface About {
	mode?: "always" | "watched" | "off";
	model: string;
	tokensPerDay: number;
	lean: string;
	mathlib: string;
	calibration: Calibration[];
}

export interface Overview {
	about: About;
	state: AgentState;
	fronts: Front[];
	backlog: Envelope[];
	episodes: Episode[];
	nodes: BlueprintNode[];
	links: Link[];
	lemmas: Lemma[];
	strip: Strip;
	watchers: number;
}

export interface Transcript {
	episode: Episode;
	turns: Turn[];
}
