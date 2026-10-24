import type { Belief } from "./follow";
import { argmax } from "./task";

export type Phase =
	| "queued"
	| "thinking"
	| "finished"
	| "answered"
	| "spent"
	| "failed";

export interface Probe {
	at: number;
	p: number[];
}

export interface Meter {
	phase: Phase;
	ahead: number;
	spent: number;
	budget: number;
	waits: number;
	forges: number;
}

export type Envelope = { seq: number } & (
	| { t: "snapshot"; text: string; probes: Probe[]; meter: Meter }
	| { t: "text"; s: string }
	| { t: "cut"; len: number }
	| ({ t: "probe" } & Probe)
	| ({ t: "meter" } & Meter)
);

export interface Thought {
	seq: number;
	text: string;
	probes: Probe[];
	meter: Meter;
}

export interface Recording {
	start: number;
	swaps: number[];
	events: [number, Envelope][];
}

export const WAITS = 3;

export const EMPTY: Thought = {
	seq: 0,
	text: "",
	probes: [],
	meter: {
		phase: "queued",
		ahead: 0,
		spent: 0,
		budget: 0,
		waits: 0,
		forges: 0,
	},
};

export function reduce(s: Thought, e: Envelope): Thought {
	if (e.t === "snapshot")
		return { seq: e.seq, text: e.text, probes: e.probes, meter: e.meter };

	if (e.seq <= s.seq) return s;

	const seq = e.seq;

	switch (e.t) {
		case "text":
			return { ...s, seq, text: s.text + e.s };
		case "cut":
			return {
				...s,
				seq,
				text: s.text.slice(0, e.len),
				probes: s.probes.filter((p) => p.at <= e.len),
			};
		case "probe":
			return {
				...s,
				seq,
				probes: [...s.probes.filter((p) => p.at < e.at), { at: e.at, p: e.p }],
			};
		case "meter": {
			const { t: _, seq: __, ...meter } = e;

			return { ...s, seq, meter };
		}
	}
}

export const keyOf = (start: number, swaps: readonly number[]) =>
	`${start}:${swaps.join(",")}`;

export const active = (phase: Phase) =>
	phase === "queued" || phase === "thinking";

export function belief(t: Thought): Belief | null {
	const last = t.probes.at(-1);

	if (!last) return null;

	return { probs: last.p, pick: argmax(last.p) };
}

export function settled(t: Thought, truth: number) {
	let at: number | null = null;

	for (const probe of t.probes) {
		if (argmax(probe.p) === truth) at ??= probe.at;
		else at = null;
	}

	return at;
}

const ANSWER =
	/(?:final (?:answer|position|result)|result|answer)\W{0,4}(?:is\W{0,3})?(?:position\W{0,3})?([1-5])(?![0-9])/gi;

export function written(text: string) {
	const said = [...text.matchAll(ANSWER)].at(-1);

	return said ? Number(said[1]) - 1 : null;
}

export function firstWritten(text: string) {
	return [...text.matchAll(ANSWER)][0]?.index ?? null;
}

export const words = (text: string) =>
	text.split(/\s+/).filter((w) => w.length > 0).length;

export interface Piece {
	text: string;
	at: number;
	digit: boolean;
}

export function pieces(text: string): Piece[] {
	const out: Piece[] = [];
	const digit = /(?<![0-9.])[1-5](?![0-9])/g;
	let last = 0;

	for (const match of text.matchAll(digit)) {
		const at = match.index ?? 0;

		if (at > last)
			out.push({ text: text.slice(last, at), at: last, digit: false });

		out.push({ text: match[0], at, digit: true });
		last = at + 1;
	}

	if (last < text.length)
		out.push({ text: text.slice(last), at: last, digit: false });

	return out;
}
