export type Verdict = "held" | "broken" | "refused";

export type Mode = "on" | "watched" | "off";

export interface Vitals {
	episodes: number;
	cards: number;
	tokens: number;
	spent: number;
	remaining: number;
	awakeSince: number;
}

export interface About {
	mode: Mode;
	model: string;
	actions: number;
	tokensPerDay: number;
}

export interface Front {
	id: string;
	title: string;
	question: string;
	kernels: string[];
}

export interface Episode {
	number: number;
	front: string;
	question: string;
	started: number;
	ended: number;
	turns: number;
	tokens: number;
	reward: number;
	summary: string;
	next: string;
}

export interface Card {
	episode: number;
	seal: string;
	kernel: string;
	question: string;
	field: string;
	op: string;
	value: number;
	chance: number;
	reference: number;
	observed: number;
	held: boolean;
	skill: number;
	verdict: Verdict;
	at: number;
}

export interface Tally {
	cards: number;
	held: number;
	broken: number;
	refused: number;
	skill: number;
}

export type Event =
	| { type: "wake"; episode: number; front: string }
	| { type: "stats"; state: Vitals }
	| { type: "retry"; drops: number }
	| { type: "trouble"; message: string }
	| {
			type: "phase";
			phase: string;
			seconds: number | null;
			reason: string;
	  }
	| { type: "delta"; turn: number; channel: "think" | "say"; text: string }
	| {
			type: "call";
			episode: number;
			turn: number;
			id: string;
			tool: string;
			args: Record<string, unknown>;
	  }
	| {
			type: "outcome";
			episode: number;
			turn: number;
			id: string;
			tool: string;
			ok: boolean;
			summary: string;
			data: Record<string, number> | null;
	  }
	| {
			type: "card";
			episode: number;
			verdict: Verdict;
			seal: string;
			field: string;
			observed: number;
			skill: number;
	  }
	| { type: "concluded"; episode: Episode };

export type Envelope = Event & { seq: number; at: number };

export interface Kept {
	version: number;
	lines: string[];
	because: string;
	gain: number | null;
	p: number | null;
	standing: string;
}

export interface RuleState {
	champion: number;
	challenger: number;
	lines: string[];
	trying: string[];
	because: string;
	pairs: number;
	trialPairs: number;
	kept: Kept[];
}

export interface Overview {
	about: About;
	state: Vitals;
	fronts: Front[];
	backlog: Envelope[];
	episodes: Episode[];
	cards: Card[];
	rules: RuleState;
	tally: Tally;
	watchers: number;
}

export interface Gate {
	replication: {
		agent: string;
		depthMm: number;
		low: number;
		high: number;
		inside: boolean;
	}[];
	limits: { check: string; held: boolean; detail: string }[];
	replicated: boolean;
	limitsHeld: boolean;
	measured: boolean;
	scores: boolean;
	method: string;
}
