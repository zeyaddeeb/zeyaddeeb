import { describe, expect, it } from "vitest";
import {
	type Cell,
	type Direction,
	FLEETS,
	type Frame,
	PERIOD,
	pick,
	specimen,
	variants,
} from "./life-ships";

const HEADING: Record<Direction, Record<string, Cell>> = {
	right: { lwss: [0, 2], mwss: [0, 2], hwss: [0, 2] },
	left: { lwss: [0, -2], mwss: [0, -2], hwss: [0, -2] },
	down: { lwss: [2, 0] },
	up: { lwss: [-2, 0] },
	"up-right": { glider: [-1, 1] },
};

const at = (frames: Frame[], g: number) =>
	frames
		.filter((f) => f.alive[g])
		.map((f) => `${f.r},${f.c}`)
		.sort();

describe("life arrow ships", () => {
	const directions = Object.keys(FLEETS) as Direction[];

	it("flies every variant one period in the direction it points", () => {
		for (const direction of directions) {
			for (let i = 0; i < variants(direction); i++) {
				const { ship, frames } = specimen(direction, i);
				const [dr, dc] = HEADING[direction][ship];
				const moved = frames
					.filter((f) => f.alive[0])
					.map((f) => `${f.r + dr},${f.c + dc}`)
					.sort();
				expect(at(frames, PERIOD)).toEqual(moved);
			}
		}
	});

	it("rests inside its own box", () => {
		for (const direction of directions) {
			for (let i = 0; i < variants(direction); i++) {
				const { frames, rows, cols } = specimen(direction, i);
				for (const f of frames.filter((f) => f.alive[0])) {
					expect(f.r).toBeGreaterThanOrEqual(0);
					expect(f.c).toBeGreaterThanOrEqual(0);
					expect(f.r).toBeLessThan(rows);
					expect(f.c).toBeLessThan(cols);
				}
				expect(Math.max(rows, cols)).toBeLessThanOrEqual(7);
			}
		}
	});

	it("gives every ship and phase a distinct silhouette", () => {
		for (const direction of directions) {
			const shapes = new Set<string>();
			for (let i = 0; i < variants(direction); i++) {
				shapes.add(at(specimen(direction, i).frames, 0).join(" "));
			}
			expect(shapes.size).toBe(variants(direction));
		}
	});

	it("never repeats a ship between neighboring numbers", () => {
		const count = variants("right");
		for (let n = 0; n < 40; n++) {
			const a = specimen("right", pick(n, count));
			const b = specimen("right", pick(n + 1, count));
			expect(a.ship).not.toBe(b.ship);
			expect(a.phase).not.toBe(b.phase);
		}
	});

	it("picks the same variant for the same seed", () => {
		expect(pick("«r1»", 12)).toBe(pick("«r1»", 12));
		expect(pick(-3, 12)).toBe(9);
	});
});
