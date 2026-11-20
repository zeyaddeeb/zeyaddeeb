import { describe, expect, it } from "vitest";
import { pearsonR } from "./math";
import {
	COINS,
	checkpoint,
	coinsOf,
	decode,
	nearest,
	neighbor,
	picks,
	place,
	ranks,
	readings,
	STUDY,
	signed,
} from "./model";
import { fairStream } from "./rng";

describe("ghosts study data", () => {
	it("holds the 600 fair coins the models saw, regenerated bit for bit", () => {
		expect(COINS).toHaveLength(600);

		for (const coin of COINS) {
			expect(coin.flips).toEqual(
				fairStream(STUDY.seed, coin.index, 16, ["H", "T"]),
			);
		}
	});

	it("names a checkpoint for every step of every training path", () => {
		for (const family of STUDY.families) {
			for (const key of family.path) {
				expect(() => checkpoint(key)).not.toThrow();
			}
		}
		expect(Object.keys(STUDY.checkpoints)).toHaveLength(15);
	});

	it("decodes scores close enough to reproduce the sealed agreement", () => {
		for (const key of Object.keys(STUDY.checkpoints)) {
			const r = readings(key);
			const c = checkpoint(key);

			expect(r.says).toHaveLength(600);
			expect(
				Math.abs(
					pearsonR(Float64Array.from(r.says), Float64Array.from(r.expects)) -
						(c.agree[0] ?? 0),
				),
			).toBeLessThan(0.02);
		}
	});

	it("keeps every registered verdict except the failed prediction", () => {
		const failed = Object.entries(STUDY.verdicts)
			.filter(([, ok]) => !ok)
			.map(([h]) => h);

		expect(failed).toEqual(["h6"]);
	});
});

describe("ghosts helpers", () => {
	it("decodes signed bytes with their scale", () => {
		const data = btoa(String.fromCharCode(0, 1, 255, 127, 129));

		expect(Array.from(decode({ scale: 0.5, data }))).toEqual([
			0, 0.5, -0.5, 63.5, -63.5,
		]);
	});

	it("reads coins most significant flip first and counts switches", () => {
		const [coin] = coinsOf("aaaa");

		expect(coin?.flips.join("")).toBe("HTHTHTHTHTHTHTHT");
		expect(coin?.switches).toBe(15);
		expect(coinsOf("ffff")[0]?.switches).toBe(0);
	});

	it("ranks share ties and run from 0 to 100", () => {
		expect(Array.from(ranks(Float32Array.from([3, 1, 2, 2, 5])))).toEqual([
			75, 0, 38, 38, 100,
		]);
	});

	it("picks the streakiest and most alternating coins", () => {
		const p = picks(COINS);
		const fewest = Math.min(...COINS.map((c) => c.switches));
		const most = Math.max(...COINS.map((c) => c.switches));

		expect(COINS[p.streaky]?.switches).toBe(fewest);
		expect(COINS[p.alternating]?.switches).toBe(most);
		expect(COINS[p.typical]?.switches).toBe(8);
	});

	it("finds the dot under the pointer and steps between neighbors", () => {
		const xs = Float32Array.from([-1, 0, 1]);
		const ys = Float32Array.from([-1, 0, 1]);
		const x = place(1, 600, 20);
		const y = 600 - place(1, 600, 20);

		expect(nearest(xs, ys, x, y, 600, 20, 10)).toBe(2);
		expect(nearest(xs, ys, 0, 0, 600, 20, 10)).toBe(-1);
		expect(neighbor(xs, 1, 1)).toBe(2);
		expect(neighbor(xs, 0, -1)).toBe(0);
	});

	it("writes signs with a real minus and drops negative zero", () => {
		expect(signed(-0.43)).toBe("−0.43");
		expect(signed(0.21)).toBe("+0.21");
		expect(signed(-0.001)).toBe("0.00");
	});
});
