export const GAMMA = 0.95;
export const BUOY_PAY = 10;
export const TIME_COST = 1;
export const PROGRESS_PAY = 1;
export const CRASH_COST = 100;
export const NUDGE_PAY = 100;
export const PRIZES = [100, 1000] as const;

export type Prize = (typeof PRIZES)[number];

export interface Rule {
	buoy: boolean;
	finish: 0 | Prize;
	time: boolean;
	progress: boolean;
	crash: boolean;
	reach: boolean;
}

export type Clause = "buoy" | "finish" | "time" | "progress" | "crash";

export const CLAUSES: Clause[] = [
	"buoy",
	"finish",
	"time",
	"progress",
	"crash",
];

export const NOTHING: Rule = {
	buoy: false,
	finish: 0,
	time: false,
	progress: false,
	crash: false,
	reach: false,
};

export const OPENING: Rule = { ...NOTHING, buoy: true };

export const has = (rule: Rule, clause: Clause) =>
	clause === "finish" ? rule.finish > 0 : rule[clause];

export function toggle(rule: Rule, clause: Clause, prize: Prize): Rule {
	if (clause === "finish")
		return { ...rule, finish: rule.finish > 0 ? 0 : prize };

	return { ...rule, [clause]: !rule[clause] };
}

export const keyOf = (rule: Rule) =>
	[
		rule.buoy ? "b" : "",
		rule.finish ? `f${rule.finish}` : "",
		rule.time ? "t" : "",
		rule.progress ? "p" : "",
		rule.crash ? "c" : "",
		rule.reach ? "r" : "",
	].join("");

export const same = (a: Rule, b: Rule) => keyOf(a) === keyOf(b);

export function everyRule(): Rule[] {
	const flags = [false, true];
	const prizes: Rule["finish"][] = [0, ...PRIZES];

	return flags.flatMap((buoy) =>
		prizes.flatMap((finish) =>
			flags.flatMap((time) =>
				flags.flatMap((progress) =>
					flags.flatMap((crash) =>
						flags.map((reach) => ({
							buoy,
							finish,
							time,
							progress,
							crash,
							reach,
						})),
					),
				),
			),
		),
	);
}
