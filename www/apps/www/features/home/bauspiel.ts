import { type Color, type Form, type Kind, type Shape, shapes } from "./scenes";

export const COLS = 8;
export const ROWS = 6;

export const LAND = { x: 4.8, y: 0.3, cell: 0.9 };
export const PORT = { x: 0.36, y: 3.89, cell: 0.66 };

const BASE = 0x4e00;
const STRIDE = 256;
const RESET = 15 * STRIDE;
const RULE = 0.14;

export interface Piece {
	name: string;
	w: number;
	h: number;
	c: Color;
	k: Kind;
	turns: boolean;
	rule?: boolean;
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

export const pieces: Record<Shape, Piece> = {
	block: { name: "triangle", w: 2, h: 2, c: "yellow", k: "tri", turns: true },
	sun: { name: "circle", w: 3, h: 3, c: "blue", k: "round", turns: false },
	moon: {
		name: "quarter circle",
		w: 1,
		h: 1,
		c: "yellow",
		k: "quarter",
		turns: true,
	},
	slab: { name: "square", w: 2, h: 2, c: "red", k: "rect", turns: false },
	core: { name: "semicircle", w: 1, h: 1, c: "ink", k: "semi", turns: true },
	line: {
		name: "bar",
		w: 3,
		h: 1,
		c: "ink",
		k: "rect",
		turns: true,
		rule: true,
	},
	dot: { name: "circle", w: 1, h: 1, c: "red", k: "round", turns: false },
};

export const initial: Place[] = [
	{ cell: 2 * COLS + 5, rot: 0 },
	{ cell: 1, rot: 0 },
	{ cell: 6, rot: 0 },
	{ cell: 2 * COLS + 3, rot: 0 },
	{ cell: 5 * COLS + 7, rot: 0 },
	{ cell: 4 * COLS, rot: 0 },
	{ cell: 5 * COLS + 4, rot: 0 },
];

export const resetCode = String.fromCodePoint(BASE + RESET);

function pieceAt(index: number) {
	const shape = shapes[index];
	return shape ? pieces[shape] : undefined;
}

export function size(piece: Piece, rot: number) {
	return rot % 2 && piece.rule
		? { w: piece.h, h: piece.w }
		: { w: piece.w, h: piece.h };
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
	let order = shapes.map((_, index) => index);
	for (const char of log) {
		const code = (char.codePointAt(0) ?? 0) - BASE;
		if (code < 0 || code > RESET) continue;
		if (code === RESET) {
			layout = initial.map((place) => ({ ...place }));
			order = shapes.map((_, index) => index);
			continue;
		}
		const index = Math.floor(code / STRIDE);
		const rest = code % STRIDE;
		const place = { cell: rest >> 2, rot: rest & 3 };
		if (index >= shapes.length || !fits(index, place)) continue;
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

export function boxOf(index: number, col: number, row: number, rot: number) {
	const piece = pieceAt(index);
	const { w, h } = piece ? size(piece, rot) : { w: 1, h: 1 };
	return { col, row, w, h };
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

function inset(box: Box, rot: number, piece: Piece): Box {
	if (!piece.rule) return box;
	const pad = (1 - RULE) / 2;
	return rot % 2
		? { ...box, col: box.col + pad, w: RULE }
		: { ...box, row: box.row + pad, h: RULE };
}

export function forms(index: number, box: Box, rot: number, spin: number) {
	const piece = pieceAt(index);
	if (!piece) return null;
	const visual = inset(box, rot, piece);
	const turn = piece.turns && !piece.rule ? spin * 90 : 0;
	const land: Form = { ...toLand(visual), c: piece.c, k: piece.k, r: turn };
	const port: Form = {
		...toPort(visual),
		c: piece.c,
		k: piece.k,
		r: turn,
	};
	return { land, port };
}
