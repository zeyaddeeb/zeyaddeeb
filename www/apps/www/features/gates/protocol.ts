export type Op = "and" | "andNot" | "notAnd" | "xor" | "or";

export interface Gate {
	a: number;
	b: number;
	op: Op;
}

export type Output =
	| { kind: "constant"; value: boolean }
	| { kind: "node"; node: number; negated: boolean };

export interface Circuit {
	inputs: number;
	gates: Gate[];
	output: Output;
}

export type Verdict = "no" | "yes" | "open";

export interface Rung {
	at: number;
	gates: number;
	verdict: Verdict;
	lemmas: number;
	bytes: number;
	millis: number;
	checkMillis: number;
	limitSeconds: number;
	reason: string | null;
	cuts: Cut[];
	pairCuts?: PairCut[];
}

export interface Cut {
	input: number;
	fanout: number;
}

export interface PairCut {
	first: number;
	second: number;
	fanout: number;
}

export interface Known {
	id: string;
	size: number;
	source: string;
}

export interface Study {
	id: string;
	family: string;
	title: string;
	rule: string;
	purpose: string | null;
	inputs: number;
	table: string;
	lower: number;
	size: number | null;
	circuit: Circuit | null;
	limitSeconds: number;
	proof: string | null;
	known: Known | null;
	rungs: Rung[];
}

export interface Calibration {
	at: number;
	matches: boolean;
	bySize: number[];
	expected: number[];
	classes: number;
	functions: number;
	lemmas: number;
	millis: number;
}

export interface Working {
	id: string;
	gates: number;
	since: number;
	limitSeconds: number;
	lemmas: number;
	note: string | null;
}

export type Preset = "default" | "plain" | "sat" | "unsat";

export interface Method {
	version: number;
	parent: number | null;
	change: string | null;
	preset: Preset;
	breaks: {
		distinct: boolean;
		colex: boolean;
		reapply: boolean;
		amo: boolean;
		opOrder: boolean;
		symmetry: boolean;
		pairCuts: boolean;
	};
	options: Record<string, number>;
}

export interface Pair {
	id: string;
	gates: number;
	before: number | null;
	after: number | null;
	beforeMillis: number;
	afterMillis: number;
}

export interface Trial {
	number: number;
	at: number;
	change: string;
	label: string;
	incumbent: number;
	candidate: Method;
	pairs: Pair[];
	wins: number;
	losses: number;
	ties: number;
	p: number;
	census: boolean | null;
	kept: boolean;
	millis: number;
	benchmark: string;
}

export interface MoveStats {
	id: string;
	label: string;
	tried: number;
	kept: number;
}

export interface Lab {
	started: number;
	workers: number;
	calibration: Calibration | null;
	working: Working | null;
	lemmas: number;
	studies: Study[];
	method: Method;
	trials: Trial[];
	moves: MoveStats[];
	nextTrialMillis: number;
}
