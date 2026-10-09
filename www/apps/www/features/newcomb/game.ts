import { type Reading, steady, type Take } from "./oracle";

export type Mode = "study" | "copy";

export interface Round {
	sealed: Take;
	took: Take;
	coin: boolean;
	copy?: 1 | 2;
	reading?: Reading | null;
}

export interface Cell {
	sealed: Take;
	took: Take;
	pay: number;
	mine: number;
	coin: number;
}

export interface Hits {
	right: number;
	of: number;
}

export const GLASS = 1_000;
export const PRIZE = 1_000_000;
export const MAX_ROUNDS = 400;

export const payout = (sealed: Take, took: Take) =>
	(sealed === 1 ? PRIZE : 0) + (took === 2 ? GLASS : 0);

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const total = (rounds: Round[]) =>
	rounds.reduce((sum, r) => sum + payout(r.sealed, r.took), 0);

const PAIRS: [Take, Take][] = [
	[1, 1],
	[1, 2],
	[2, 1],
	[2, 2],
];

export function cells(rounds: Round[]): Cell[] {
	return PAIRS.map(([sealed, took]) => {
		const here = rounds.filter((r) => r.sealed === sealed && r.took === took);
		const coin = here.filter((r) => r.coin).length;

		return {
			sealed,
			took,
			pay: payout(sealed, took),
			mine: here.length - coin,
			coin,
		};
	});
}

export function average(rounds: Round[], took: Take): number | null {
	const here = rounds.filter((r) => r.took === took);

	return here.length ? total(here) / here.length : null;
}

export function hits(rounds: Round[], coin: boolean): Hits {
	const here = rounds.filter((r) => r.coin === coin);

	return {
		right: here.filter((r) => r.sealed === r.took).length,
		of: here.length,
	};
}

export function always(mode: Mode, take: Take, rounds: number) {
	if (mode === "copy") return rounds * payout(take, take);

	return steady(take, rounds).reduce((sum, s) => sum + payout(s, take), 0);
}

const choice = (take: Take) => (take === 1 ? "only B" : "both");

function studied(r: Round) {
	const who = r.coin ? "The coin" : "You";
	const did = r.coin ? "chose" : "took";
	const won = money(payout(r.sealed, r.took));

	if (r.sealed === 1 && r.took === 1)
		return `It expected one box and filled B. ${who} ${did} only B: ${won}.`;

	if (r.sealed === 2 && r.took === 2)
		return `It expected both and left B empty. ${who} ${did} both: ${won}.`;

	if (r.sealed === 1)
		return `${who} surprised it. B was full and ${who.toLowerCase()} ${did} both: ${won}.`;

	return `It expected both, so B was empty. ${who} ${did} only B: ${won}.`;
}

function copied(r: Round) {
	const copy = r.copy ?? 1;
	const you = copy === 1 ? 2 : 1;
	const won = money(payout(r.sealed, r.took));
	const box = r.sealed === 1 ? "full" : "empty";
	const its = r.sealed === 1 ? "one box" : "both";

	return `Play ${copy} was the copy. It took ${its}, so B was ${box}. Play ${you} was you: ${choice(r.took)}, ${won}.`;
}

export const OPENING: Record<Mode, string> = {
	study:
		"Box B is already sealed. If the program expects you to take only B, it put $1,000,000 inside. If it expects you to take both, B is empty.",
	copy: "You will choose twice. One of the two is a copy of you that the predictor runs to fill B. Which one is already sealed.",
};

export const SECOND =
	"Play 2. Same boxes, same question. Is this you, or the copy?";

export function caption(mode: Mode, rounds: Round[], second: boolean) {
	if (mode === "copy" && second) return SECOND;

	const last = rounds.at(-1);

	if (!last) return OPENING[mode];

	return mode === "study" ? studied(last) : copied(last);
}

const percent = (h: Hits) => `${Math.round((100 * h.right) / h.of)}%`;

export function calls(mode: Mode, rounds: Round[]) {
	const mine = hits(rounds, false);
	const coin = hits(rounds, true);

	if (mine.of + coin.of === 0)
		return mode === "study"
			? "Nothing to go on yet, so it trusts you and fills B."
			: "Answer the same both times and the copy always agrees with you.";

	if (mode === "study") {
		const you = `${mine.right} of your ${mine.of} choices (${percent(mine)})`;
		const flips = `${coin.right} of ${coin.of} coin flips (${percent(coin)})`;

		if (!coin.of) return `It called ${you}.`;
		if (!mine.of) return `It called ${flips}.`;

		return `It called ${you} and ${flips}.`;
	}

	const you = `Your two answers matched in ${mine.right} of ${mine.of} rounds`;
	const flips = `${coin.right} of ${coin.of}`;

	if (!coin.of) return `${you}.`;
	if (!mine.of) return `Rounds with the coin matched ${flips} times.`;

	return `${you}; rounds with the coin, ${flips}.`;
}

export function down(rounds: Round[]) {
	const one = average(rounds, 1);
	const both = average(rounds, 2);

	if (one !== null && both !== null)
		return `Your one-box rounds paid ${money(one)} on average, your two-box rounds ${money(both)}.`;

	if (one !== null)
		return `Your one-box rounds paid ${money(one)} on average. Take both sometime to compare.`;

	if (both !== null)
		return `Your two-box rounds paid ${money(both)} on average. Take one box sometime to compare.`;

	return "Down each column: what your one-box and two-box rounds paid on average.";
}

export const ACROSS =
	"Across each row: whatever B held, taking both paid $1,000 more.";

const WORDS = ["", "one", "two", "three", "four", "five"];
const phrase = (take: Take) => (take === 1 ? "one box" : "both");

export function why(mode: Mode, rounds: Round[]) {
	if (mode === "copy")
		return "Top row: the copy’s answer, which decided B. Bottom row: yours. The copy is you, so whatever reasoning you use, it uses too.";

	const at = rounds.length - 1;
	const last = rounds[at];

	if (!last)
		return "Each column is a round. Top: its guess. Bottom: what you took. One hole is one box, two holes are both.";

	const r = last.reading;
	const n = at + 1;

	if (!r)
		return `Round ${n}: with nothing to go on, it trusted you and filled B.`;

	const guess = phrase(last.sealed);
	const count = last.sealed === 1 ? r.ones : r.seen - r.ones;

	if (r.order === 0)
		return `Round ${n}: overall you had taken ${guess} ${count} of ${r.seen} times, so it guessed ${guess}.`;

	const before = rounds[at - 1];

	if (r.order === 1 && before)
		return `Round ${n}: after ${phrase(before.took)}, you had taken ${guess} next ${count} of ${r.seen} times, so it guessed ${guess}.`;

	return `Round ${n}: your last ${WORDS[r.order]} choices had come up ${r.seen} ${r.seen === 1 ? "time" : "times"} before, and ${count} of those times you took ${guess} next.`;
}
