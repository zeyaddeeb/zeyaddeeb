import { describe, expect, it } from "vitest";
import { pack, schedule, unpack } from "./speaker";

describe("pack", () => {
	it("joins chunks into 16-bit samples", () => {
		const packed = pack([
			new Float32Array([0, 0.5]),
			new Float32Array([-0.5, 1]),
		]);

		expect([...packed]).toEqual([0, 16384, -16383, 32767]);
	});

	it("clips what is too loud", () => {
		expect([...pack([new Float32Array([2, -2])])]).toEqual([32767, -32767]);
	});

	it("packs nothing into nothing", () => {
		expect(pack([]).length).toBe(0);
	});
});

describe("unpack", () => {
	it("reads back what was packed", () => {
		const samples = new Float32Array([0, 0.25, -0.75, 1]);
		const back = unpack(pack([samples]).buffer);

		expect(back.length).toBe(4);

		for (let i = 0; i < samples.length; i++)
			expect(back[i]).toBeCloseTo(samples[i], 4);
	});

	it("ignores a stray last byte", () => {
		expect(unpack(new Uint8Array([0, 64, 7]).buffer).length).toBe(1);
	});
});

describe("schedule", () => {
	it("starts a little ahead when nothing is queued", () => {
		const { at, due } = schedule(10, 0, 0.02);

		expect(at).toBeGreaterThan(10);
		expect(due).toBeCloseTo(at + 0.02);
	});

	it("continues exactly where the last chunk ends", () => {
		const first = schedule(10, 0, 0.02);
		const second = schedule(10.001, first.due, 0.02);

		expect(second.at).toBe(first.due);
		expect(second.due).toBeCloseTo(first.due + 0.02);
	});

	it("catches up after falling behind", () => {
		const { at } = schedule(12, 10.5, 0.02);

		expect(at).toBeGreaterThan(12);
	});
});
