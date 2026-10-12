import { describe, expect, it } from "vitest";
import { kit, lifetime, tonePatches } from "./patches";
import { ceiling, knee, limit, polyphony } from "./synth";
import { drums, tones } from "./voices";

const decibels = (level: number) => 20 * Math.log10(level);

describe("limit", () => {
	it("leaves a signal below the knee untouched", () => {
		for (const x of [-knee, -0.3, 0, 0.01, 0.42, knee])
			expect(limit(x)).toBe(x);
	});

	it("never passes -1 dBFS however hard it is driven", () => {
		expect(decibels(ceiling)).toBeLessThan(-1);

		for (const x of [0.7, 1, 2, 50]) {
			expect(limit(x)).toBeLessThanOrEqual(ceiling);
			expect(limit(-x)).toBe(-limit(x));
		}
	});

	it("bends without a step or a fold", () => {
		for (let x = 0; x < 2; x += 0.001) {
			const rise = limit(x + 0.001) - limit(x);

			expect(rise).toBeGreaterThan(0);
			expect(rise).toBeLessThanOrEqual(0.001 + 1e-12);
		}
	});
});

describe("patches", () => {
	it("gives every voice a sound", () => {
		for (const voice of tones) {
			const patch = tonePatches[voice];

			expect(patch.partials[0], voice).toBe(1);
			expect(patch.spread.length, voice).toBeGreaterThan(0);
			expect(Math.abs(patch.pan), voice).toBeLessThanOrEqual(1);
		}

		for (const voice of drums)
			expect(kit[voice].ring ?? kit[voice].hiss, voice).toBeDefined();
	});

	it("spends at most two oscillators on a note", () => {
		for (const voice of tones)
			expect(tonePatches[voice].spread.length, voice).toBeLessThanOrEqual(2);

		expect(polyphony).toBe(24);
	});

	it("lets a held voice last its note and a plucked one die away", () => {
		expect(lifetime("accordion", 2)).toBeGreaterThan(2);
		expect(lifetime("accordion", 2)).toBeLessThan(2.5);
		expect(lifetime("pluck", 2)).toBe(lifetime("pluck", 4));
		expect(lifetime("pluck", 2)).toBeLessThan(1.2);
		expect(lifetime("banjo", 0.05)).toBeLessThan(lifetime("banjo", 1));
	});

	it("frees every drum within a second", () => {
		for (const voice of drums) {
			expect(lifetime(voice, 0.1), voice).toBeGreaterThan(0.05);
			expect(lifetime(voice, 0.1), voice).toBeLessThan(1);
		}
	});
});
