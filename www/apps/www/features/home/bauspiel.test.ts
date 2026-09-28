import { describe, expect, it } from "vitest";
import {
	BASELINE,
	boxOf,
	COLS,
	encode,
	fits,
	fold,
	forms,
	fromLand,
	fromPort,
	initial,
	isInitial,
	kit,
	LAND,
	PORT,
	ROWS,
	resetCode,
	snap,
	toLand,
	toPort,
	turned,
} from "./bauspiel";

describe("bauspiel", () => {
	it("starts from a valid layout", () => {
		expect(initial).toHaveLength(kit.length);
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
		const off = encode(0, { cell: COLS - 1, rot: 0 });
		const spun = encode(0, { cell: 0, rot: 1 });
		expect(isInitial(fold(off + spun).layout)).toBe(true);
	});

	it("resets", () => {
		const log = encode(2, { cell: 0, rot: 0 }) + resetCode;
		expect(isInitial(fold(log).layout)).toBe(true);
	});

	it("turns every piece in place on the grid", () => {
		kit.forEach((piece, index) => {
			for (let cell = 0; cell < COLS * ROWS; cell++) {
				for (let rot = 0; rot < 4; rot++) {
					const { w, h } = boxOf(index, 0, 0, rot);
					const inside =
						(cell % COLS) + w <= COLS && Math.floor(cell / COLS) + h <= ROWS;
					expect(fits(index, { cell, rot })).toBe(
						inside && (rot === 0 || piece.turns),
					);
				}
			}
		});
	});

	it("turns long pieces about their middle", () => {
		const index = kit.findIndex((piece) => piece.h === 5);
		const place = { cell: 1 * COLS + 6, rot: 0 };
		expect(turned(index, place)).toEqual({ cell: 3 * COLS + 4, rot: 1 });
		expect(
			turned(
				kit.findIndex((piece) => !piece.turns),
				place,
			),
		).toBeNull();
	});

	it("spells oh hi on the lettering lines", () => {
		const { layout } = fold("");
		layout.forEach((place, index) => {
			const piece = kit[index];
			if (!piece || piece.id === "dot") return;
			const row = Math.floor(place.cell / COLS);
			expect(row + piece.h).toBe(BASELINE);
		});
	});

	it("maps the board the same way in both orientations", () => {
		const box = { col: 2, row: 1, w: 2, h: 1 };
		const land = toLand(box);
		const port = toPort(box);
		const landBack = fromLand(land.x, land.y);
		expect(landBack.col).toBeCloseTo(2);
		expect(landBack.row).toBeCloseTo(1);
		const back = fromPort(port.x, port.y);
		expect(back.col).toBeCloseTo(2);
		expect(back.row).toBeCloseTo(1);
	});

	it("preserves every piece's position, proportions, and rotation across screens", () => {
		kit.forEach((_, index) => {
			for (let rot = 0; rot < 4; rot++) {
				for (let cell = 0; cell < COLS * ROWS; cell++) {
					if (!fits(index, { cell, rot })) continue;
					const box = boxOf(index, cell % COLS, Math.floor(cell / COLS), rot);
					const result = forms(index, box, rot);
					if (!result) throw new Error("Missing piece forms");
					const { land, port } = result;
					expect((port.x - PORT.x) / PORT.cell).toBeCloseTo(
						(land.x - LAND.x) / LAND.cell,
					);
					expect((port.y - PORT.y) / PORT.cell).toBeCloseTo(
						(land.y - LAND.y) / LAND.cell,
					);
					expect(port.w / PORT.cell).toBeCloseTo(land.w / LAND.cell);
					expect(port.h / PORT.cell).toBeCloseTo(land.h / LAND.cell);
					expect(port.r).toBe(land.r);
					const corner = toPort(box);
					const back = fromPort(corner.x, corner.y);
					expect(snap(index, back.col, back.row, rot)).toEqual({ cell, rot });
				}
			}
		});
	});

	it("keeps a mobile drag rightward and downward on the shared board", () => {
		const index = kit.findIndex((piece) => piece.id === "sun");
		const start = toPort({ col: 1, row: 1, w: 3, h: 3 });
		const target = fromPort(start.x + PORT.cell * 2, start.y + PORT.cell);
		const move = snap(index, target.col, target.row, 1);
		if (!move) throw new Error("Missing move");
		const { layout } = fold(encode(index, move));
		expect(layout[index]).toEqual({ cell: 2 * COLS + 3, rot: 1 });
		const land = toLand(boxOf(index, 3, 2));
		expect((land.x - LAND.x) / LAND.cell).toBeCloseTo(3);
		expect((land.y - LAND.y) / LAND.cell).toBeCloseTo(2);
	});
});
