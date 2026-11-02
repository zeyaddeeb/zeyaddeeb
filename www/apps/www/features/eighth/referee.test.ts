import { describe, expect, it } from "vitest";
import { shuffle } from "./deal";
import { PRESETS, START } from "./deck";
import { CEILING, NATURE } from "./nature";
import type { Trial } from "./protocol";
import { score, timing } from "./referee";
import { seeded } from "./seeded";

const nature = PRESETS.find((p) => p.id === "nature")?.deck ?? START;
const N = 60000;

function near(agree: (number | null)[], tolerance: number) {
	agree.forEach((a, i) => {
		expect(Math.abs((a ?? -1) - (NATURE[i] ?? 0))).toBeLessThan(tolerance);
	});
}

describe("referee", () => {
	it("scores an honest card at the classical ceiling", () => {
		const s = score(shuffle("deck", START, seeded(1), N), "honest");

		expect(s.agree[1] ?? 0).toBeCloseTo(CEILING, 1);
		expect(s.anti).toBe(0);
	});

	it("lets the signed tally of minus one eighth match nature", () => {
		const s = score(shuffle("deck", nature, seeded(2), N), "honest");

		near(s.agree, 0.02);
		expect(s.anti / s.scored).toBeCloseTo(0.1, 1);
	});

	it("sees through going dark only when silence is counted", () => {
		const trials = shuffle("dark", START, seeded(3), N);
		const dropped = score(trials, "drop");
		const honest = score(trials, "honest");

		near(dropped.agree, 0.02);
		expect(dropped.scored / N).toBeCloseTo(1 / 3, 1);
		expect(honest.agree[1] ?? 1).toBeLessThan(CEILING + 0.01);
	});

	it("lets talk and fixed dials both reach nature", () => {
		near(score(shuffle("talk", START, seeded(4), N), "honest").agree, 0.02);
		near(score(shuffle("fixed", START, seeded(5), N), "honest").agree, 0.02);
	});

	it("counts pairs a dark station never answered as lost", () => {
		const trials = shuffle("deck", START, seeded(6), 100).map(
			(t, k): Trial => (k >= 60 ? { ...t, dials: [null, t.dials[1]] } : t),
		);

		expect(score(trials, "honest").lost).toBe(40);
	});

	it("flags answers that came after light could have carried the other dial", () => {
		const at = (
			west: number,
			east: number,
			heard: number | null = null,
		): Trial => ({
			k: 0,
			dials: [0, 1],
			answers: [1, 1],
			sign: 1,
			card: null,
			west: { dial: 0, commit: west, heard },
			east: { dial: 0, commit: east },
		});
		const clocks = {
			west: { offset_ns: 0, bound_ns: 300_000, measured: true },
			east: { offset_ns: 0, bound_ns: 200_000, measured: true },
		};
		const t = timing([at(5, 4), at(33_000, 3, 32_990)], 12_025, clocks);

		expect(t.timed).toBe(2);
		expect(t.spacelike).toBe(1);
		expect(t.late).toBe(1);
		expect(t.loose).toBe(0);
		expect(t.boundMs).toBeCloseTo(0.5, 6);
		expect(t.closestMs).toBeCloseTo((12_025 - 500 - 33_000) / 1000, 6);
		expect(t.packetMs).toBeCloseTo(32.99, 6);
		expect(t.lateMs).toBeCloseTo((33_000 - 12_025) / 1000, 6);
	});

	it("tells loose clocks apart from late answers", () => {
		const on: Trial = {
			k: 0,
			dials: [0, 1],
			answers: [1, 1],
			sign: 1,
			card: null,
			west: { dial: 0, commit: 10, heard: null },
			east: { dial: 2, commit: 9 },
		};
		const loose = {
			west: { offset_ns: 0, bound_ns: 8_000_000, measured: true },
			east: { offset_ns: 0, bound_ns: 8_000_000, measured: true },
		};
		const t = timing([on], 12_025, loose);

		expect(t.spacelike).toBe(0);
		expect(t.late).toBe(0);
		expect(t.loose).toBe(1);

		const blind = timing([on], 12_025, {
			west: loose.west,
			east: { offset_ns: 0, bound_ns: 5_000_000, measured: false },
		});

		expect(blind.unmeasured).toBe(true);
		expect(blind.spacelike).toBe(0);
		expect(timing([on], 12_025, null).unmeasured).toBe(true);
	});
});
