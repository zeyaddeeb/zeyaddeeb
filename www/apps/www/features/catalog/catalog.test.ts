import { describe, expect, it } from "vitest";
import {
	experiments,
	getExperiment,
	neighbors,
	number,
	seriesOf,
} from "./catalog";

describe("catalog", () => {
	it("has unique ids, numbers and hrefs", () => {
		const ids = new Set(experiments.map((e) => e.id));
		const nums = new Set(experiments.map((e) => e.number));
		const hrefs = new Set(experiments.map((e) => e.href));

		expect(ids.size).toBe(experiments.length);
		expect(nums.size).toBe(experiments.length);
		expect(hrefs.size).toBe(experiments.length);
	});

	it("numbers are contiguous from 1", () => {
		const sorted = [...experiments].map((e) => e.number).sort((a, b) => a - b);

		expect(sorted).toEqual(sorted.map((_, i) => i + 1));
	});

	it("external entries have absolute hrefs, local ones are root-relative", () => {
		for (const e of experiments) {
			if (e.external) expect(e.href).toMatch(/^https?:\/\//);
			else expect(e.href).toMatch(/^\//);
		}
	});

	it("formats numbers", () => {
		expect(number(4)).toBe("04");
	});

	it("neighbors wrap and skip external entries", () => {
		const n = neighbors("game-of-life");

		expect(n?.next.id).toBe("circle-limit");
		expect(n?.prev.external).toBeFalsy();
	});

	it("neighbors follow experiment numbers, not listing order", () => {
		const newest = Math.max(...experiments.map((e) => e.number));
		const last = experiments.find((e) => e.number === newest);
		const n = neighbors(last?.id ?? "");

		expect(n?.prev.number).toBe(newest - 1);
		expect(n?.next.number).toBe(1);
		expect(neighbors("proofs")?.next.number).toBe(13);
		expect(neighbors("story")?.next.id).toBe("wes-anderson");
	});

	it("orders a series by experiment number and counts parts from one", () => {
		const series = seriesOf(getExperiment("every-program"));

		expect(series?.parts.map((part) => part.id)).toEqual([
			"deepseek",
			"every-program",
			"already-sealed",
		]);
		expect(series?.part).toBe(2);
		expect(seriesOf(getExperiment("game-of-life"))).toBeNull();
	});

	it("gives every series more than one part", () => {
		for (const experiment of experiments) {
			const series = seriesOf(experiment);

			if (series) expect(series.parts.length).toBeGreaterThan(1);
		}
	});
});
