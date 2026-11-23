import { describe, expect, it } from "vitest";
import type { Method, Pair, Trial } from "./protocol";
import {
	pairLabel,
	position,
	pValue,
	recipe,
	side,
	trialLine,
} from "./tuning-text";

const plain: Method = {
	version: 1,
	parent: null,
	change: null,
	preset: "default",
	breaks: {
		distinct: false,
		colex: false,
		reapply: false,
		amo: false,
		opOrder: false,
		symmetry: false,
		pairCuts: false,
	},
	options: {},
};

function pair(before: number | null, after: number | null): Pair {
	return {
		id: "mod3-5",
		gates: 8,
		before,
		after,
		beforeMillis: 0,
		afterMillis: 0,
	};
}

describe("the tuning panel", () => {
	it("names a method by what it changes", () => {
		expect(recipe(plain)).toEqual(["Plain encoding, default solver"]);
		expect(
			recipe({
				...plain,
				preset: "unsat",
				breaks: {
					...plain.breaks,
					distinct: true,
					reapply: true,
					symmetry: true,
				},
				options: { elim: 0, stabilize: 1 },
			}),
		).toEqual([
			"No two gates alike",
			"No re-read inputs",
			"Symmetric inputs in order",
			"Solver tuned for unsat",
			"elimination off",
			"stabilizing phases on",
		]);
	});

	it("scores each race by proof length, with a timeout as the loser", () => {
		expect(side(pair(100, 50))).toBe("win");
		expect(side(pair(50, 100))).toBe("loss");
		expect(side(pair(50, 50))).toBe("tie");
		expect(side(pair(10_000, 9_950))).toBe("tie");
		expect(side(pair(10_000, 9_750))).toBe("win");
		expect(side(pair(null, 50))).toBe("win");
		expect(side(pair(50, null))).toBe("loss");
		expect(side(pair(null, null))).toBe("tie");
	});

	it("places lemma counts on a log axis", () => {
		expect(position(null)).toBeNull();
		expect(position(1)).toBe(0);
		expect(position(10_000)).toBeCloseTo(0.5, 5);
		expect(position(1e12)).toBe(1);
	});

	it("summarizes a trial in one honest line", () => {
		const trial: Trial = {
			number: 3,
			at: 0,
			change: "break:colex=on",
			label: "Require that independent neighboring gates come in a fixed order",
			incumbent: 1,
			candidate: plain,
			pairs: [],
			wins: 7,
			losses: 1,
			ties: 0,
			p: 9 / 256,
			census: true,
			kept: true,
			millis: 1000,
			benchmark: "",
		};

		expect(trialLine(trial)).toBe(
			"7 shorter, 1 longer, p = 0.035. Kept after Knuth’s table checked out class by class.",
		);
		expect(
			trialLine({ ...trial, kept: false, census: null, wins: 2, p: 0.5 }),
		).toBe("2 shorter, 1 longer, p = 0.500. Not enough to keep.");
		expect(pValue(0.0001)).toBe("p < 0.001");
		expect(pairLabel(pair(1, 1), [])).toBe("mod3-5 · 8 gates");
	});
});
