import type { Color, Form, Kind, Shape } from "./scenes";

export const COLS = 14;
export const ROWS = 7;
export const XHEIGHT = 2;
export const BASELINE = 5;

export const LAND = { x: 4.84, y: 1.32, cell: 0.48 };
export const PORT = { x: 0.36, y: 4.55, cell: 0.377 };

const BASE = 0x4e00;
const STRIDE = 512;
const RESET = 15 * STRIDE;

export interface Piece {
	id: Shape | string;
	label: string;
	w: number;
	h: number;
	c: Color;
	k: Kind;
	turns: boolean;
}

export interface Place {
	cell: number;
	rot: number;
}

export interface Box {
	col: number;
	row: number;
	w: number;
	h: number;
}

export const kit: Piece[] = [
	{
		id: "block",
		label: "Blue ring",
		w: 3,
		h: 3,
		c: "blue",
		k: "ring",
		turns: false,
	},
	{ id: "sun", label: "Red arch", w: 3, h: 3, c: "red", k: "bow", turns: true },
	{
		id: "moon",
		label: "Tall stem",
		w: 1,
		h: 5,
		c: "ink",
		k: "rect",
		turns: true,
	},
	{
		id: "slab",
		label: "Red arch",
		w: 3,
		h: 3,
		c: "red",
		k: "bow",
		turns: true,
	},
	{
		id: "core",
		label: "Tall stem",
		w: 1,
		h: 5,
		c: "ink",
		k: "rect",
		turns: true,
	},
	{
		id: "line",
		label: "Short stem",
		w: 1,
		h: 3,
		c: "ink",
		k: "rect",
		turns: true,
	},
	{
		id: "dot",
		label: "Here now",
		w: 1,
		h: 1,
		c: "red",
		k: "round",
		turns: false,
	},
];

const at = (col: number, row: number, rot = 0): Place => ({
	cell: row * COLS + col,
	rot,
});

export const initial: Place[] = [
	at(0, 2),
	at(4, 2),
	at(4, 0),
	at(9, 2),
	at(9, 0),
	at(13, 2),
	at(13, 0),
];

export const resetCode = String.fromCodePoint(BASE + RESET);

function pieceAt(index: number) {
	return kit[index];
}

export function size(piece: Piece, rot = 0) {
	return rot % 2 ? { w: piece.h, h: piece.w } : { w: piece.w, h: piece.h };
}

export function fits(index: number, place: Place) {
	const piece = pieceAt(index);

	if (!piece) return false;

	if (place.cell < 0 || place.cell >= COLS * ROWS) return false;

	if (place.rot < 0 || place.rot > 3) return false;

	if (!piece.turns && place.rot !== 0) return false;

	const { w, h } = size(piece, place.rot);

	return (
		(place.cell % COLS) + w <= COLS && Math.floor(place.cell / COLS) + h <= ROWS
	);
}

export function snap(index: number, col: number, row: number, rot: number) {
	const piece = pieceAt(index);

	if (!piece) return null;

	const { w, h } = size(piece, rot);
	const c = Math.max(0, Math.min(COLS - w, Math.round(col)));
	const r = Math.max(0, Math.min(ROWS - h, Math.round(row)));

	return { cell: r * COLS + c, rot };
}

export function encode(index: number, place: Place) {
	return String.fromCodePoint(
		BASE + index * STRIDE + place.cell * 4 + place.rot,
	);
}

export function fold(log: string) {
	let layout = initial.map((place) => ({ ...place }));
	let order = kit.map((_, index) => index);

	for (const char of log) {
		const code = (char.codePointAt(0) ?? 0) - BASE;

		if (code < 0 || code > RESET) continue;

		if (code === RESET) {
			layout = initial.map((place) => ({ ...place }));
			order = kit.map((_, index) => index);

			continue;
		}

		const index = Math.floor(code / STRIDE);
		const rest = code % STRIDE;
		const place = { cell: rest >> 2, rot: rest & 3 };

		if (index >= kit.length || !fits(index, place)) continue;

		layout[index] = place;
		order = [...order.filter((item) => item !== index), index];
	}

	return { layout, order };
}

export function isInitial(layout: Place[]) {
	return layout.every(
		(place, index) =>
			place.cell === initial[index]?.cell && place.rot === initial[index]?.rot,
	);
}

export function boxOf(index: number, col: number, row: number, rot = 0) {
	const piece = pieceAt(index);
	const { w, h } = piece ? size(piece, rot) : { w: 1, h: 1 };

	return { col, row, w, h };
}

export function turned(index: number, place: Place) {
	const piece = pieceAt(index);

	if (!piece?.turns) return null;

	const rot = (place.rot + 1) % 4;
	const from = size(piece, place.rot);
	const to = size(piece, rot);
	const col = (place.cell % COLS) + (from.w - to.w) / 2;
	const row = Math.floor(place.cell / COLS) + (from.h - to.h) / 2;

	return snap(index, col, row, rot);
}

export function toLand(box: Box) {
	return {
		x: LAND.x + box.col * LAND.cell,
		y: LAND.y + box.row * LAND.cell,
		w: box.w * LAND.cell,
		h: box.h * LAND.cell,
	};
}

export function toPort(box: Box) {
	return {
		x: PORT.x + box.col * PORT.cell,
		y: PORT.y + box.row * PORT.cell,
		w: box.w * PORT.cell,
		h: box.h * PORT.cell,
	};
}

export function fromLand(x: number, y: number) {
	return { col: (x - LAND.x) / LAND.cell, row: (y - LAND.y) / LAND.cell };
}

export function fromPort(x: number, y: number) {
	return {
		col: (x - PORT.x) / PORT.cell,
		row: (y - PORT.y) / PORT.cell,
	};
}

export function forms(index: number, box: Box, spin: number) {
	const piece = pieceAt(index);

	if (!piece) return null;

	const skin = { c: piece.c, k: piece.k, r: piece.turns ? spin * 90 : 0 };

	const body = {
		col: box.col + (box.w - piece.w) / 2,
		row: box.row + (box.h - piece.h) / 2,
		w: piece.w,
		h: piece.h,
	};

	const land: Form = { ...toLand(body), ...skin };
	const port: Form = { ...toPort(body), ...skin };

	return { land, port };
}
