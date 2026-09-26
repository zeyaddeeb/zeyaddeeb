import { describe, expect, it } from "vitest";
import {
	anchorFor,
	encode,
	fits,
	fold,
	initial,
	isInitial,
	occupied,
	pieces,
	resetCode,
} from "./bauspiel";

describe("bauspiel", () => {
	it("starts from a composition with no overlaps", () => {
		const cells = pieces.reduce((sum, piece) => sum + piece.w * piece.h, 0);
		expect(occupied(initial).size).toBe(cells);
		expect(isInitial(fold(""))).toBe(true);
	});

	it("applies legal moves and skips ones that no longer fit", () => {
		const quarterToFree = encode(2, { cell: 15, rot: 0 });
		const triangleToSame = encode(4, { cell: 15, rot: 0 });
		const layout = fold(quarterToFree + triangleToSame);
		expect(layout[2]).toEqual({ cell: 15, rot: 0 });
		expect(layout[4]).toEqual(initial[4]);
	});

	it("converges regardless of which concurrent move lands first", () => {
		const a = encode(2, { cell: 15, rot: 0 });
		const b = encode(4, { cell: 15, rot: 0 });
		expect(fold(a + b)[2]?.cell).toBe(15);
		expect(fold(b + a)[4]?.cell).toBe(15);
		expect(occupied(fold(a + b)).size).toBe(occupied(initial).size);
	});

	it("turns long pieces and keeps them on the board", () => {
		const layout = fold(encode(4, { cell: 15, rot: 0 }));
		expect(fits(layout, 3, { cell: 10, rot: 1 })).toBe(true);
		const low = fold(
			encode(4, { cell: 15, rot: 0 }) + encode(3, { cell: 18, rot: 0 }),
		);
		expect(low[3]).toEqual({ cell: 18, rot: 0 });
		expect(fits(low, 3, { cell: 18, rot: 1 })).toBe(false);
		expect(anchorFor(low, 3, 18, 1)).toEqual({ cell: 14, rot: 1 });
		expect(anchorFor(initial, 0, 19, 0)).toBeNull();
	});

	it("resets and ignores foreign characters", () => {
		const moved = encode(2, { cell: 15, rot: 2 });
		expect(isInitial(fold(moved))).toBe(false);
		expect(isInitial(fold(`${moved}hello${resetCode}`))).toBe(true);
	});

	it("encodes every piece and cell without colliding with reset", () => {
		const codes = new Set<string>();
		pieces.forEach((_, index) => {
			for (let cell = 0; cell < 20; cell++) {
				for (let rot = 0; rot < 4; rot++)
					codes.add(encode(index, { cell, rot }));
			}
		});
		expect(codes.size).toBe(pieces.length * 80);
		expect(codes.has(resetCode)).toBe(false);
	});
});
