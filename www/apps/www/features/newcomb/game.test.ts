import { describe, expect, it } from "vitest";
import {
	always,
	average,
	calls,
	caption,
	cells,
	down,
	money,
	OPENING,
	payout,
	type Round,
	SECOND,
	why,
} from "./game";
import { forecast, type Take } from "./oracle";

const round = (sealed: Take, took: Take, coin = false): Round => ({
	sealed,
	took,
	coin,
});

describe("game", () => {
	it("pays Newcomb's table", () => {
		expect(payout(1, 1)).toBe(1_000_000);
		expect(payout(1, 2)).toBe(1_001_000);
		expect(payout(2, 1)).toBe(0);
		expect(payout(2, 2)).toBe(1_000);
		expect(money(1_001_000)).toBe("$1,001,000");
	});

	it("sorts rounds into the four cells", () => {
		const rounds = [round(1, 1), round(1, 1, true), round(2, 2), round(1, 2)];
		const [fullOne, fullBoth, emptyOne, emptyBoth] = cells(rounds);

		expect(fullOne).toMatchObject({ mine: 1, coin: 1, pay: 1_000_000 });
		expect(fullBoth).toMatchObject({ mine: 1, coin: 0 });
		expect(emptyOne).toMatchObject({ mine: 0, coin: 0, pay: 0 });
		expect(emptyBoth).toMatchObject({ mine: 1, pay: 1_000 });
	});

	it("shows both arguments in the same rounds", () => {
		const rounds = [round(1, 1), round(1, 1), round(2, 2), round(1, 2)];

		expect(average(rounds, 1)).toBe(1_000_000);
		expect(average(rounds, 2)).toBe(501_000);
		expect(down(rounds)).toBe(
			"Your one-box rounds paid $1,000,000 on average, your two-box rounds $501,000.",
		);
	});

	it("scores steady players against the same predictor", () => {
		expect(always("study", 1, 10)).toBe(10_000_000);
		expect(always("study", 2, 10)).toBe(1_001_000 + 9 * 1_000);
		expect(always("copy", 1, 10)).toBe(10_000_000);
		expect(always("copy", 2, 10)).toBe(10_000);
	});

	it("narrates each outcome", () => {
		expect(caption("study", [], false)).toBe(OPENING.study);
		expect(caption("copy", [], true)).toBe(SECOND);
		expect(caption("study", [round(1, 2)], false)).toBe(
			"You surprised it. B was full and you took both: $1,001,000.",
		);
		expect(caption("study", [round(2, 1, true)], false)).toBe(
			"It expected both, so B was empty. The coin chose only B: $0.",
		);
		expect(caption("copy", [{ ...round(1, 2), copy: 2 }], false)).toBe(
			"Play 2 was the copy. It took one box, so B was full. Play 1 was you: both, $1,001,000.",
		);
	});

	it("counts calls on you and on the coin apart", () => {
		const rounds = [round(1, 1), round(2, 2), round(1, 2), round(1, 1, true)];

		expect(calls("study", rounds)).toBe(
			"It called 2 of your 3 choices (67%) and 1 of 1 coin flips (100%).",
		);
		expect(calls("copy", rounds.slice(0, 3))).toBe(
			"Your two answers matched in 2 of 3 rounds.",
		);
	});

	it("explains the last guess from its reading", () => {
		const takes: Take[] = [1, 2, 1, 2, 1, 2, 1];
		const rounds: Round[] = takes.map((took, i) => {
			const f = forecast(takes.slice(0, i));

			return { sealed: f.take, took, coin: false, reading: f.reading };
		});

		expect(why("study", rounds.slice(0, 1))).toBe(
			"Round 1: with nothing to go on, it trusted you and filled B.",
		);
		expect(why("study", rounds)).toBe(
			"Round 7: your last four choices had come up 1 time before, and 1 of those times you took one box next.",
		);
	});
});
