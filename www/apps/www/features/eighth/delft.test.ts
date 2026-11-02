import { describe, expect, it } from "vitest";
import {
	DELFT,
	leastNegative,
	RING_NATURE,
	shots,
	shuffled,
	tally,
} from "./delft";
import { seeded } from "./seeded";

describe("Delft 2015", () => {
	it("holds all 245 trials and the 196 wins Hensen reports", () => {
		const t = tally(shots());

		expect(t.n).toBe(DELFT.trials);
		expect(t.won).toBe(DELFT.wins);
		expect(t.rate).toBeCloseTo(0.8, 12);
	});

	it("reproduces S = 2.42 from the per-setting counts", () => {
		expect(tally(shots()).s).toBeCloseTo(2.4225, 3);
	});

	it("keeps the counts when the order is shuffled", () => {
		const t = tally(shuffled(seeded(9)));

		expect(t.won).toBe(DELFT.wins);
		expect(t.perPair.map((p) => p?.toFixed(4))).toEqual(
			tally(shots()).perPair.map((p) => p?.toFixed(4)),
		);
	});

	it("sits between the eight-dot ceiling and a perfect pair", () => {
		expect(RING_NATURE).toBeCloseTo(Math.cos(Math.PI / 8) ** 2, 12);
		expect(leastNegative(0.8)).toBeCloseTo(1 / 15, 12);
		expect(DELFT.choiceUs + DELFT.readoutUs).toBeLessThan(DELFT.lightUs);
		expect(DELFT.lightUs - DELFT.choiceUs - DELFT.readoutUs).toBeCloseTo(
			0.09,
			6,
		);
	});
});
