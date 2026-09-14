import { describe, expect, it } from "vitest";
import { experiments, neighbors, number } from "./catalog";

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
});
