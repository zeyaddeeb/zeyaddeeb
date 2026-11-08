import { describe, expect, it } from "vitest";
import { argmax, SIDE, softmax, toInput } from "./ink";

function canvas(width: number, paint: (x: number, y: number) => boolean) {
	const alpha = new Uint8ClampedArray(width * width);
	for (let y = 0; y < width; y++) {
		for (let x = 0; x < width; x++) {
			if (paint(x, y)) alpha[y * width + x] = 255;
		}
	}
	return alpha;
}

function centroid(input: Float32Array) {
	let mass = 0;
	let cx = 0;
	let cy = 0;
	for (let y = 0; y < SIDE; y++) {
		for (let x = 0; x < SIDE; x++) {
			const v = (input[y * SIDE + x] + 1) / 2;
			mass += v;
			cx += v * (x + 0.5);
			cy += v * (y + 0.5);
		}
	}
	return { mass, x: cx / mass, y: cy / mass };
}

describe("toInput", () => {
	it("returns a blank digit for an empty pad", () => {
		const input = toInput(new Uint8ClampedArray(280 * 280), 280);
		expect(input.every((v) => v === -1)).toBe(true);
	});

	it("moves a stroke drawn in a corner to the middle, as MNIST does", () => {
		const alpha = canvas(280, (x, y) => x > 10 && x < 40 && y > 10 && y < 120);
		const c = centroid(toInput(alpha, 280));
		expect(Math.abs(c.x - SIDE / 2)).toBeLessThan(1);
		expect(Math.abs(c.y - SIDE / 2)).toBeLessThan(1);
	});

	it("fits the tallest side into a 20 pixel box", () => {
		const alpha = canvas(
			280,
			(x, y) => x > 100 && x < 110 && y > 20 && y < 260,
		);
		const input = toInput(alpha, 280);
		let rows = 0;
		for (let y = 0; y < SIDE; y++) {
			if (input.slice(y * SIDE, (y + 1) * SIDE).some((v) => v > -0.9)) rows++;
		}
		expect(rows).toBeGreaterThanOrEqual(19);
		expect(rows).toBeLessThanOrEqual(21);
	});
});

describe("softmax", () => {
	it("sums to one and keeps the order", () => {
		const p = softmax([0, 1, 2, 9, 9, 9], 3, 6);
		expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
		expect(argmax(softmax([3, 1, 2], 0, 3))).toBe(0);
	});
});
