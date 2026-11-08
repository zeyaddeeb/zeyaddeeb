export interface Interval {
	mean: number;
	low: number;
	high: number;
}

export interface SuspectRow {
	name: string;
	family: string;
	agreement: number;
	spare: number;
	accuracy: number;
	capable: boolean;
	primary: number;
	draws: number;
	long: number;
}

export interface InheritRow {
	name: string;
	family: string;
	lie_before: number;
	lie_after: number;
	accuracy_before: number;
	accuracy_after: number;
}

export interface Study {
	protocol: string;
	seed: number;
	files: Record<string, number>;
	digits: { count: number; bytes: number };
	shown: {
		suspects: SuspectRow[];
		inherit: InheritRow[];
		parentAccuracy: number;
	};
	verdicts: {
		auc: { primary: number; agreement: number; spare: number };
		auc_low: Record<string, number>;
		auc_high: Record<string, number>;
		auc_diff_high: Record<string, number>;
		degraded_auc: number;
		degraded_auc_low: number;
		imitation_diff_mean: number;
		imitation_diff_high: number;
		lie_diff_low: Record<string, number>;
		threshold: number;
		false_positive_rate: number;
		pass: Record<"h1" | "h2" | "h3" | "h4" | "h5" | "h6", boolean>;
	};
	kinds: Record<string, Record<string, Interval>>;
	inherit: Record<string, Record<string, Interval>>;
	calls: Record<string, number>;
	exploratory: Record<
		"imitator" | "stranger",
		{ primary: number; spare: number; agreement: number }
	>;
	evaluationSeeds: number;
}
