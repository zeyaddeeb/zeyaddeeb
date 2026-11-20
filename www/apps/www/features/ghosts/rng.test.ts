import { describe, expect, it } from "vitest";
import { coinFeatures, developGhost, findNgramEchoes, sdtStats } from "./math";
import parity from "./parity.json";
import { binaryPatch, fairStream, noiseGrid } from "./rng";

function toMatrix(flat: Int8Array, size: number): number[][] {
	const rows: number[][] = [];
	for (let r = 0; r < size; r++) {
		rows.push(Array.from(flat.slice(r * size, (r + 1) * size)));
	}
	return rows;
}

describe("ghosts Python <-> TypeScript parity", () => {
	it("matches 9x9 ASCII noise grids bit for bit", () => {
		expect(toMatrix(noiseGrid(parity.seed, 0, 9), 9)).toEqual(parity.ascii9_0);
		expect(toMatrix(noiseGrid(parity.seed, 17, 9), 9)).toEqual(
			parity.ascii9_17,
		);
	});

	it("matches 8x8 and 6x6 VLM binary patches bit for bit", () => {
		expect(toMatrix(binaryPatch(parity.seed, 0, 8), 8)).toEqual(parity.bin8_0);
		expect(toMatrix(binaryPatch(parity.seed, 5, 6), 6)).toEqual(parity.bin6_5);
	});

	it("matches fair coin and 4-symbol streams bit for bit", () => {
		expect(fairStream(parity.seed, 0, 16, ["H", "T"])).toEqual(
			parity.coins16_0,
		);
		expect(fairStream(parity.seed, 9, 16, ["H", "T"])).toEqual(
			parity.coins16_9,
		);
		expect(fairStream(parity.seed, 0, 32, ["A", "B", "C", "D"])).toEqual(
			parity.abcd32_0,
		);
		expect(fairStream(parity.seed, 2, 32, ["W", "K", "M", "Z"])).toEqual(
			parity.wkmz32_2,
		);
	});

	it("computes ghost reverse correlation, echoes, and SDT accurately", () => {
		const frames = Array.from({ length: 200 }, (_, i) => noiseGrid(100, i, 6));
		const scores = new Float64Array(200);
		for (let i = 0; i < 200; i++) {
			scores[i] = frames[i]?.[0] ?? 0;
		}
		const g = developGhost(frames, scores, 200);
		expect(g.full[0]).toBeGreaterThan(0.8);
		expect(g.splitR).toBeGreaterThan(0.6);

		const cf = coinFeatures(["H", "H", "H", "T", "H", "T"]);
		expect(cf.maxRun).toBe(3);
		expect(cf.alts).toBeCloseTo(3 / 5);

		const echoes = findNgramEchoes(["A", "B", "C", "D", "A", "B", "C", "A"], 3);
		expect(echoes[7]).toBe(3);

		const sdt = sdtStats(90, 100, 10, 100);
		expect(sdt.dPrime).toBeGreaterThan(2.0);
		expect(Math.abs(sdt.criterion)).toBeLessThan(0.05);
	});
});
