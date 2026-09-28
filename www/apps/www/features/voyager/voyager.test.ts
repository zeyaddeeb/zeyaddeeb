import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { build } from "../../scripts/voyager-source.mjs";
import {
	full,
	line,
	period,
	pulsars,
	rotation,
	seconds,
	side,
	ticks,
} from "./cover";
import { AU_KM, fix, lightDay } from "./ephemeris";
import { MEMORY_BYTES } from "./facts";
import {
	instruments,
	LAUNCH_YEAR,
	offParts,
	watts,
	wattsPerYear,
	yearOf,
} from "./instruments";
import { source } from "./source-data";

describe("rust excerpts", () => {
	it("match the code that runs", () => {
		const rs = readFileSync(
			new URL("../../../../packages/wasm/src/voyager.rs", import.meta.url),
			"utf8",
		);
		expect(build(rs)).toEqual(source);
	});
});

describe("golden record cover", () => {
	it("reads 3.6 seconds a turn", () => {
		expect(full(rotation)).toHaveLength(33);
		expect(ticks(rotation)).toBe(5_113_380_864n);
		expect(seconds(rotation)).toBeCloseTo(3.6, 3);
	});

	it("reads about 54 minutes a side", () => {
		expect(full(side)).toHaveLength(43);
		expect(seconds(side) / 60).toBeCloseTo(53.8, 1);
	});

	it("reads 8.34 ms a line", () => {
		expect(ticks(line)).toBe(11_845_632n);
		expect(seconds(line) * 1000).toBeCloseTo(8.34, 2);
	});

	it("decodes the pulsar periods", () => {
		expect(pulsars).toHaveLength(14);
		const crab = pulsars.find((p) => p.nickname === "Crab");
		const vela = pulsars.find((p) => p.nickname === "Vela");
		expect(crab && period(crab)).toBeCloseTo(0.0331296448, 9);
		expect(vela && period(vela)).toBeCloseTo(0.0892187481, 9);
	});
});

describe("ephemeris", () => {
	it("puts Voyager 1 about 172 AU away now", () => {
		const f = fix(Date.UTC(2026, 8, 28));
		expect(f.km / AU_KM).toBeCloseTo(172.13, 1);
		expect(f.sunKmPerS).toBeCloseTo(16.88, 1);
		expect(f.lightSeconds / 3600).toBeCloseTo(23.86, 1);
	});

	it("crosses one light-day within a day of NASA's moment", () => {
		const nasa = Date.UTC(2026, 10, 18, 10, 16, 7);
		expect(Math.abs(lightDay() - nasa)).toBeLessThan(24 * 3600 * 1000);
	});
});

describe("power", () => {
	it("fits launch and 2023", () => {
		expect(watts(LAUNCH_YEAR)).toBeCloseTo(470, 5);
		expect(watts(2023.5)).toBeCloseTo(225, 5);
		expect(wattsPerYear(2026.74)).toBeGreaterThan(3);
		expect(wattsPerYear(2026.74)).toBeLessThan(4);
	});

	it("leaves two instruments on after April 2026", () => {
		const on = instruments.filter(
			(i) => i.off === null || yearOf(i.off) > 2026.5,
		);
		expect(on.map((i) => i.id)).toEqual(["MAG", "PWS"]);
		expect([...offParts(2026.5)].sort()).toEqual([
			"crs",
			"lecp",
			"pls",
			"scan",
		]);
		expect(offParts(1978).size).toBe(0);
	});
});

describe("memory", () => {
	it("totals 69,632 bytes", () => {
		expect(MEMORY_BYTES).toBe(69_632);
	});
});
