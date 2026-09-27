import { describe, expect, it } from "vitest";
import {
	COLS,
	encode,
	fits,
	fold,
	fromLand,
	fromPort,
	initial,
	isInitial,
	ROWS,
	resetCode,
	snap,
	toLand,
	toPort,
} from "./bauspiel";
import { shapes } from "./scenes";

describe("bauspiel", () => {
	it("starts from a valid layout", () => {
		expect(initial).toHaveLength(shapes.length);
		initial.forEach((place, index) => {
			expect(fits(index, place)).toBe(true);
		});
		expect(isInitial(fold("").layout)).toBe(true);
	});

	it("applies moves and raises the moved piece", () => {
		const move = encode(2, { cell: 0, rot: 0 });
		const { layout, order } = fold(move);
		expect(layout[2]).toEqual({ cell: 0, rot: 0 });
		expect(order.at(-1)).toBe(2);
	});

	it("skips moves that leave the board or turn a fixed piece", () => {
		const off = encode(1, { cell: COLS - 1, rot: 0 });
		const spun = encode(2, { cell: 0, rot: 1 });
		expect(isInitial(fold(off + spun).layout)).toBe(true);
	});

	it("resets", () => {
		const log = encode(2, { cell: 0, rot: 0 }) + resetCode;
		expect(isInitial(fold(log).layout)).toBe(true);
	});

	it("turns the rule on its side", () => {
		const line = shapes.indexOf("line");
		expect(fits(line, { cell: 0, rot: 1 })).toBe(true);
		expect(fits(line, { cell: (ROWS - 1) * COLS, rot: 1 })).toBe(false);
		expect(snap(line, 0, ROWS, 1)).toEqual({ cell: (ROWS - 3) * COLS, rot: 1 });
	});

	it("maps the board the same way in both orientations", () => {
		const box = { col: 2, row: 1, w: 2, h: 1 };
		const land = toLand(box);
		const port = toPort(box);
		const landBack = fromLand(land.x, land.y);
		expect(landBack.col).toBeCloseTo(2);
		expect(landBack.row).toBeCloseTo(1);
		const back = fromPort(port.x, port.y, box.h);
		expect(back.col).toBeCloseTo(2);
		expect(back.row).toBeCloseTo(1);
	});
});
