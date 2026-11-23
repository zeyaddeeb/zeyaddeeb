import type { Method, Pair, Study, Trial } from "./protocol";

const BREAKS: [keyof Method["breaks"], string][] = [
	["distinct", "No two gates alike"],
	["colex", "Neighbors in order"],
	["reapply", "No re-read inputs"],
	["amo", "One wire pair per gate"],
	["opOrder", "Same-input ops in order"],
	["symmetry", "Symmetric inputs in order"],
	["pairCuts", "Two-input restriction cuts"],
];

const OPTIONS: Record<string, string> = {
	elim: "elimination",
	vivify: "vivification",
	probe: "probing",
	subsume: "subsumption",
	congruence: "congruence closure",
	sweep: "SAT sweeping",
	walk: "local search",
	chrono: "chronological backtracking",
	stabilize: "stabilizing phases",
};

export function recipe(method: Method): string[] {
	const parts = BREAKS.filter(([key]) => method.breaks[key]).map(
		([, label]) => label,
	);

	if (method.preset !== "default")
		parts.push(`Solver tuned for ${method.preset}`);

	for (const [name, value] of Object.entries(method.options)) {
		parts.push(`${OPTIONS[name] ?? name} ${value === 0 ? "off" : "on"}`);
	}

	return parts.length ? parts : ["Plain encoding, default solver"];
}

export type PairSide = "win" | "loss" | "tie";

const MIN_REL_DIFF = 0.02;

export function side(pair: Pair): PairSide {
	if (pair.before !== null && pair.after !== null) {
		const delta = Math.abs(pair.before - pair.after);
		const scale = Math.max(pair.before, pair.after);
		const significant = scale < 50 ? delta > 0 : delta / scale >= MIN_REL_DIFF;

		if (!significant) return "tie";

		if (pair.after < pair.before) return "win";

		return "loss";
	}

	if (pair.after !== null) return "win";

	if (pair.before !== null) return "loss";

	return "tie";
}

export const AXIS_CEILING = 8;

export function position(lemmas: number | null): number | null {
	if (lemmas === null) return null;

	return Math.min(1, Math.log10(Math.max(lemmas, 1)) / AXIS_CEILING);
}

export function pValue(p: number): string {
	if (p < 0.001) return "p < 0.001";

	return `p = ${p.toFixed(3)}`;
}

export function trialLine(trial: Trial): string {
	const tally = `${trial.wins} shorter, ${trial.losses} longer${trial.ties ? `, ${trial.ties} even` : ""}`;

	if (trial.kept)
		return `${tally}, ${pValue(trial.p)}. Kept after Knuth’s table checked out class by class.`;

	if (trial.census === false)
		return `${tally}, ${pValue(trial.p)}. Rejected: Knuth’s table no longer checked out.`;

	return `${tally}, ${pValue(trial.p)}. Not enough to keep.`;
}

export function pairLabel(pair: Pair, studies: Study[]): string {
	const study = studies.find((s) => s.id === pair.id);
	const name = study ? `${study.title}, ${study.inputs} inputs` : pair.id;

	return `${name} · ${pair.gates} gates`;
}
