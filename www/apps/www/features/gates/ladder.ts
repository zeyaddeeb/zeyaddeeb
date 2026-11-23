import type { Lab, Rung, Study, Working } from "./protocol";

export const LOG_CEILING = 9;

export type RungState = "no" | "yes" | "asking" | "open" | "untried";

export interface RungView {
	gates: number;
	state: RungState;
	lemmas: number;
	millis: number;
	checkMillis: number;
	share: number;
	kept: boolean;
	note: string;
}

export function share(lemmas: number): number {
	if (lemmas <= 0) return 0;

	return Math.min(1, Math.log10(lemmas + 1) / LOG_CEILING);
}

const integer = new Intl.NumberFormat("en-US");

export function count(value: number): string {
	return integer.format(Math.round(value));
}

export function span(millis: number): string {
	const seconds = millis / 1000;

	if (seconds < 1) return `${Math.max(1, Math.round(millis))} ms`;

	if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;

	const minutes = seconds / 60;

	if (minutes < 60) return `${Math.round(minutes)} min`;

	const hours = minutes / 60;

	if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;

	return `${Math.round(hours / 24)} days`;
}

export function limit(seconds: number): string {
	return span(seconds * 1000);
}

function latest(rungs: Rung[]): Map<number, Rung> {
	const byGates = new Map<number, Rung>();

	for (const rung of rungs) byGates.set(rung.gates, rung);

	return byGates;
}

export function ladder(
	study: Study,
	working: Working | null,
	now: number,
): RungView[] {
	const asking = working?.id === study.id ? working : null;
	const top = Math.max(study.size ?? 0, study.lower, asking?.gates ?? 0);
	const byGates = latest(study.rungs);
	const views: RungView[] = [];

	for (let gates = 1; gates <= top; gates += 1) {
		const rung = byGates.get(gates);

		if (asking && asking.gates === gates) {
			views.push({
				gates,
				state: "asking",
				lemmas: asking.lemmas,
				millis: Math.max(0, now - asking.since),
				checkMillis: 0,
				share: share(asking.lemmas),
				kept: false,
				note: `${count(asking.lemmas)} lemmas so far, ${span(Math.max(0, now - asking.since))} of ${limit(asking.limitSeconds)}`,
			});

			continue;
		}

		if (!rung) {
			views.push({
				gates,
				state: "untried",
				lemmas: 0,
				millis: 0,
				checkMillis: 0,
				share: 0,
				kept: false,
				note: "Not asked yet",
			});

			continue;
		}

		const kept =
			rung.verdict === "no" &&
			study.proof !== null &&
			study.proof.endsWith(`-${gates}`);

		views.push({
			gates,
			state:
				rung.verdict === "no" ? "no" : rung.verdict === "yes" ? "yes" : "open",
			lemmas: rung.lemmas,
			millis: rung.millis,
			checkMillis: rung.checkMillis,
			share: share(rung.lemmas),
			kept,
			note:
				rung.verdict === "no"
					? `No: ${count(rung.lemmas)} lemmas, all checked${rung.cuts.length || rung.pairCuts?.length ? ", cut by smaller answers" : ""}`
					: rung.verdict === "yes"
						? `Yes, found in ${span(rung.millis)}`
						: rung.reason &&
								!rung.reason.startsWith("no answer") &&
								rung.reason !== "cancelled"
							? `Open: ${rung.reason}`
							: `Open after ${limit(rung.limitSeconds)}; next try gets ${limit(study.limitSeconds)}`,
		});
	}

	return views;
}

export type Standing =
	| { kind: "settled"; size: number; matches: boolean | null }
	| { kind: "bounded"; lower: number };

export function standing(study: Study): Standing {
	if (study.size !== null) {
		return {
			kind: "settled",
			size: study.size,
			matches: study.known ? study.known.size === study.size : null,
		};
	}

	return { kind: "bounded", lower: study.lower };
}

export function standingText(study: Study): string {
	const now = standing(study);

	if (now.kind === "settled")
		return `${now.size} ${now.size === 1 ? "gate" : "gates"}`;

	return `at least ${now.lower}`;
}

export interface Group {
	label: string;
	studies: Study[];
}

export function groups(lab: Lab): Group[] {
	const main = lab.studies.filter((s) => s.purpose === null);
	const auxiliary = lab.studies.filter((s) => s.purpose !== null);
	const sizes = [...new Set(main.map((s) => s.inputs))].sort((a, b) => a - b);

	const byInputs = sizes.map((inputs) => ({
		label: `${inputs} inputs`,
		studies: main.filter((s) => s.inputs === inputs),
	}));

	return auxiliary.length
		? [...byInputs, { label: "Solved first", studies: auxiliary }]
		: byInputs;
}

export function totalLemmas(lab: Lab): number {
	return lab.studies.reduce(
		(sum, study) => sum + study.rungs.reduce((s, r) => s + r.lemmas, 0),
		0,
	);
}
