import { list, number, rule } from "./formula";

export const BUDGET = 26;

export type View = "map" | "crowd";

export interface Tile {
	id: number;
	x: number;
	y: number;
	w: number;
	h: number;
	kind: "rule" | "memo" | "silent";
	rule: string;
	seeds: number[];
	next: number | null;
	bits: number;
	tone: number;
	share: number;
}

export interface Vote {
	value: number;
	share: number;
	tone: number;
}

export interface Tally {
	terms: number[];
	votes: Vote[];
	fitting: number;
	silent: number;
	considered: number;
	silentMass: number;
	answeredMass: number;
	unexplored: number;
}

export const EXAMPLES = [
	{ id: "counting", label: "Counting", terms: [1, 2, 3, 4, 5] },
	{ id: "squares", label: "Squares", terms: [1, 4, 9, 16, 25] },
	{ id: "fibonacci", label: "Fibonacci", terms: [1, 1, 2, 3, 5, 8] },
	{ id: "doubling", label: "Doubling", terms: [1, 2, 4, 8, 16] },
	{ id: "primes", label: "Primes", terms: [2, 3, 5, 7, 11] },
	{ id: "pi", label: "Pi", terms: [3, 1, 4, 1, 5, 9] },
] as const;

export const MAX_TERMS = 12;

export function votes(flat: Float64Array): Vote[] {
	const out: Vote[] = [];

	for (let i = 0; i + 1 < flat.length; i += 2) {
		out.push({
			value: flat[i] ?? 0,
			share: flat[i + 1] ?? 0,
			tone: Math.min(out.length, 3),
		});
	}

	return out;
}

export function percent(share: number) {
	if (share >= 0.9995) return "over 99.9%";
	if (share >= 0.995) return `${(share * 100).toFixed(1)}%`;
	if (share >= 0.01) return `${Math.round(share * 100)}%`;
	if (share > 0) return "under 1%";

	return "0%";
}

export function short(share: number) {
	if (share >= 0.995)
		return `${Math.min(99.9, Math.floor(share * 1000) / 10)}%`;
	if (share >= 0.01) return `${Math.round(share * 100)}%`;

	return "<1%";
}

export const count = (n: number) => Math.round(n).toLocaleString("en-US");

export function caption(t: Tally) {
	const top = t.votes[0];

	if (t.terms.length === 0) {
		return `Every program up to ${BUDGET} bits is a tile here, as big as its vote. Give it a number and watch the ones that disagree disappear.`;
	}

	if (!top) return "Nothing is left to vote.";

	const seen = list(t.terms);

	if (t.fitting === 0) {
		return `No rule up to ${BUDGET} bits makes ${seen}. All that is left is remembering it and guessing a small number: ${number(top.value)}.`;
	}

	const fit =
		t.fitting === 1 ? "One program fits" : `${count(t.fitting)} programs fit`;

	if (top.share < 0.5) {
		return `${fit} ${seen}. The vote is split; ${number(top.value)} leads with ${percent(top.share)}.`;
	}

	const lead = percent(top.share);

	return `${fit} ${seen}. ${lead[0]?.toUpperCase()}${lead.slice(1)} of their vote says ${number(top.value)}.`;
}

export function describe(tile: Tile) {
	if (tile.kind === "memo") {
		const said = tile.next === null ? "" : `, then say ${number(tile.next)}`;

		return tile.seeds.length === 0
			? `Start with ${number(tile.next ?? 0)}`
			: `Remember ${list(tile.seeds)}${said}`;
	}

	const start = tile.seeds.length > 0 ? `, starting ${list(tile.seeds)}` : "";

	return `${rule(tile.rule)}${start}`;
}

export function verdict(tile: Tile) {
	const bits = `${tile.bits} bits`;

	if (tile.kind === "silent") return `${bits} · never answered`;

	const says = tile.next === null ? "" : ` · says ${number(tile.next)}`;

	return `${bits} · ${percent(tile.share)} of the vote${says}`;
}

export function rgba(hex: string) {
	const clean = hex.trim().replace("#", "");
	const full =
		clean.length === 3
			? clean
					.split("")
					.map((c) => c + c)
					.join("")
			: clean.slice(0, 6);
	const value = Number.parseInt(full, 16);

	return Number.isNaN(value) ? 0x808080ff : ((value << 8) | 0xff) >>> 0;
}
