import type { Name } from "./models";
import type { Interval } from "./study";
import { STUDY } from "./study-data";

export const pct = (v: number) => `${Math.round(v * 100)}%`;

export const signed = (v: number) =>
	`${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;

export const range = (i: Interval) => `${pct(i.low)} to ${pct(i.high)}`;

const EMPTY: Interval = { mean: 0, low: 0, high: 0 };

export const lieOf = (study: string) =>
	STUDY.inherit[study]?.lie_after ?? EMPTY;

export const scoreOf = (kind: string) => STUDY.kinds[kind]?.primary ?? EMPTY;

export const kindOf = (kind: string, metric: string) =>
	STUDY.kinds[kind]?.[metric] ?? EMPTY;

export const callOf = (kind: string) => STUDY.calls[kind] ?? 0;

const shownSuspect = (name: string) =>
	STUDY.shown.suspects.find((s) => s.name === name);

const shownInherit = (name: string) =>
	STUDY.shown.inherit.find((s) => s.name === name);

export interface Relative {
	id: "sister" | "lookalike" | "stranger";
	name: Name;
	title: string;
	how: string;
	study: string;
	agreement: number;
	accuracy: number;
}

export const RELATIVES: Relative[] = [
	{
		id: "sister",
		name: "sister",
		title: "Sister",
		how: "Began as an exact copy of the parent, then spent 1,000 steps learning clothes.",
		study: "clothes-1000",
		agreement: shownSuspect("clothes-1000")?.agreement ?? 0,
		accuracy: shownInherit("clothes-1000")?.accuracy_before ?? 0,
	},
	{
		id: "lookalike",
		name: "lookalike",
		title: "Look-alike",
		how: "A separate network trained to copy every output the parent gives on digits.",
		study: "digits-20",
		agreement: shownSuspect("digits-20")?.agreement ?? 0,
		accuracy: shownInherit("digits-20")?.accuracy_before ?? 0,
	},
	{
		id: "stranger",
		name: "stranger",
		title: "Stranger",
		how: "Learned digits on its own, from its own random start.",
		study: "same-0",
		agreement: shownSuspect("same-0")?.agreement ?? 0,
		accuracy: shownInherit("same-0")?.accuracy_before ?? 0,
	},
];

export interface Suspect {
	letter: "A" | "B" | "C" | "D";
	name: Name;
	kind: string;
	stolen: boolean;
	truth: string;
	agreement: number;
}

const suspectRow = (kind: string) => shownSuspect(kind.split("/")[1] ?? kind);

export const SUSPECTS: Suspect[] = [
	{
		letter: "A",
		name: "more",
		kind: "descendant/more",
		stolen: true,
		truth: "Stolen, then trained one more epoch on digits.",
		agreement: suspectRow("descendant/more")?.agreement ?? 0,
	},
	{
		letter: "B",
		name: "copycat",
		kind: "imitator/both",
		stolen: false,
		truth:
			"Never saw the weights. Copied the parent's outputs on static and on digits.",
		agreement: suspectRow("imitator/both")?.agreement ?? 0,
	},
	{
		letter: "C",
		name: "pruned",
		kind: "descendant/prune-0.6",
		stolen: true,
		truth: "Stolen, then 60% of its weights set to zero.",
		agreement: suspectRow("descendant/prune-0.6")?.agreement ?? 0,
	},
	{
		letter: "D",
		name: "outsider",
		kind: "stranger/same-1",
		stolen: false,
		truth: "An honest network that learned digits on its own.",
		agreement: suspectRow("stranger/same-1")?.agreement ?? 0,
	},
];

export const PARENT_ACCURACY = STUDY.shown.parentAccuracy;
export const THRESHOLD = STUDY.verdicts.threshold;
export const SEEDS = STUDY.evaluationSeeds;
export const TEACHER_LIE =
	STUDY.shown.suspects.find((s) => s.name === "lie")?.accuracy ?? 0;
