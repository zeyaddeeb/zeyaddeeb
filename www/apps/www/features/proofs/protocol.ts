export interface Hypothesis {
	names: string[];
	type: string;
}

export interface Goal {
	case: string | null;
	hyps: Hypothesis[];
	target: string;
}

export interface Step {
	tactic: string;
	ok: boolean;
	goals: Goal[];
	error: string | null;
}

export interface LevelStart {
	id: string;
	statement: string;
	goals: Goal[];
}

export interface Checked {
	level: string;
	goals: Goal[];
	steps: Step[];
	solved: boolean;
	leanMs: number;
}
