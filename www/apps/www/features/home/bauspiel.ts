import type { Color, Form, Kind, Shape } from "./scenes";

export const COLS = 8;
export const ROWS = 6;

export const LAND = { x: 4.8, y: 0.3, cell: 0.9 };
export const PORT = { x: 0.36, y: 3.89, cell: 0.66 };

const BASE = 0x4e00;
const STRIDE = 256;
const RESET = 15 * STRIDE;

export interface Piece {
	id: Shape | string;
	label: string;
	size: 1 | 2;
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
		label: "Large blue quarter circle",
		size: 2,
		c: "blue",
		k: "quarter",
		turns: true,
	},
	{
		id: "sun",
		label: "Black circle with a yellow halo",
		size: 2,
		c: "none",
		k: "halo",
		turns: false,
	},
	{
		id: "moon",
		label: "Small red quarter circle",
		size: 1,
		c: "red",
		k: "quarter",
		turns: true,
	},
	{
		id: "slab",
		label: "Large yellow triangle",
		size: 2,
		c: "yellow",
		k: "tri",
		turns: true,
	},
	{
		id: "core",
		label: "Large red half circle",
		size: 2,
		c: "red",
		k: "semi",
		turns: true,
	},
	{ id: "line", label: "Black arc", size: 2, c: "ink", k: "arc", turns: true },
	{ id: "dot", label: "Here now", size: 1, c: "red", k: "round", turns: false },
	{
		id: "petal",
		label: "Small blue quarter circle",
		size: 1,
		c: "blue",
		k: "quarter",
		turns: true,
	},
];

const at = (col: number, row: number, rot = 0): Place => ({
	cell: row * COLS + col,
	rot,
});

export const initial: Place[] = [
	at(5, 1, 1),
	at(0, 1),
	at(6, 3),
	at(3, 3),
	at(0, 4, 2),
	at(1, 2),
	at(7, 0),
	at(7, 3, 1),
];

export const resetCode = String.fromCodePoint(BASE + RESET);

function pieceAt(index: number) {
	return kit[index];
}

export function size(piece: Piece) {
	return { w: piece.size, h: piece.size };
}

export function fits(index: number, place: Place) {
	const piece = pieceAt(index);
	if (!piece) return false;
	if (place.cell < 0 || place.cell >= COLS * ROWS) return false;
	if (place.rot < 0 || place.rot > 3) return false;
	if (!piece.turns && place.rot !== 0) return false;
	const { w, h } = size(piece);
	return (
		(place.cell % COLS) + w <= COLS && Math.floor(place.cell / COLS) + h <= ROWS
	);
}

export function snap(index: number, col: number, row: number, rot: number) {
	const piece = pieceAt(index);
	if (!piece) return null;
	const { w, h } = size(piece);
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

export function boxOf(index: number, col: number, row: number) {
	const piece = pieceAt(index);
	const { w, h } = piece ? size(piece) : { w: 1, h: 1 };
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

export function forms(index: number, box: Box, spin: number) {
	const piece = pieceAt(index);
	if (!piece) return null;
	const skin = { c: piece.c, k: piece.k, r: piece.turns ? spin * 90 : 0 };
	const land: Form = { ...toLand(box), ...skin };
	const port: Form = { ...toPort(box), ...skin };
	return { land, port };
}
