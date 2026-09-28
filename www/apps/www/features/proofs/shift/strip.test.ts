import { describe, expect, it } from "vitest";
import type { Strip } from "./protocol";
import { along, ceiling, figure, ticks } from "./strip";

const empty: Strip = {
	frontier: 0,
	bins: [],
	recent: [],
	closest: [],
	probes: [],
};

describe("the strip figure", () => {
	it("rounds the height up to a decade on a log axis", () => {
		expect(ceiling(0)).toBe(100);
		expect(ceiling(101.3)).toBe(1000);
		expect(ceiling(7020)).toBe(10000);
		expect(ticks(1000)).toEqual([10, 100, 1000]);
	});

	it("weighs bands by zeros per unit height, densest at 1", () => {
		const result = figure(
			{
				...empty,
				frontier: 100,
				bins: [
					{ from: 10, to: 55, zeros: 9 },
					{ from: 55, to: 100, zeros: 20 },
				],
			},
			100,
			[],
		);
		const [low, high] = result.bands.map((b) => b.weight);
		expect(low).toBeCloseTo(0.45);
		expect(high).toBe(1);
	});

	it("draws live scans on top of what is stored", () => {
		const result = figure({ ...empty, recent: [14.13, 21.02] }, 30, [
			{
				kind: "line",
				from: 20,
				to: 40,
				sigma: null,
				zeros: [21.02, 25.01],
				found: null,
			},
			{
				kind: "contour",
				from: 30,
				to: 60,
				sigma: [0.6, 0.9],
				zeros: [],
				found: 0,
			},
		]);
		expect(result.zeros).toEqual([14.13, 21.02, 25.01]);
		expect(result.scanning).toEqual({ from: 20, to: 40 });
		expect(result.boxes).toEqual([
			{ sigma: [0.6, 0.9], from: 30, to: 60, found: 0, live: true },
		]);
		expect(result.top).toBe(100);
		expect(result.ticks).toEqual([10, 100]);
	});

	it("draws a rectangle searched twice only once", () => {
		const probe = {
			sigmaFrom: 0.6,
			sigmaTo: 0.95,
			tFrom: 7000,
			tTo: 7020,
			zeros: 0,
			episode: 1,
		};
		const result = figure(
			{ ...empty, probes: [probe, { ...probe, episode: 2 }] },
			0,
			[
				{
					kind: "contour",
					from: 7000,
					to: 7020,
					sigma: [0.6, 0.95],
					zeros: [],
					found: 0,
				},
			],
		);
		expect(result.boxes).toHaveLength(1);
		expect(result.boxes[0].live).toBe(true);
	});

	it("places heights by decade and clamps them", () => {
		expect(along(5, 1000)).toBe(0);
		expect(along(100, 1000)).toBeCloseTo(0.5);
		expect(along(5000, 1000)).toBe(1);
	});
});
