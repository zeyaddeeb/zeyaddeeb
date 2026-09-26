import { type Experiment, getExperiment } from "../catalog/catalog";

export const COLS = 4;
export const ROWS = 5;

const BASE = 0x3400;
const STRIDE = 128;
const RESET = 15 * STRIDE;

export type Kind =
	| "disc"
	| "stripes"
	| "quarter"
	| "arch"
	| "triangles"
	| "count"
	| "experiments"
	| "blog"
	| "library";

export interface Piece {
	kind: Kind;
	w: number;
	h: number;
	turns: boolean;
	experiment?: Experiment;
}

export interface Place {
	cell: number;
	rot: number;
}

export const pieces: Piece[] = [
	{
		kind: "disc",
		w: 2,
		h: 2,
		turns: false,
		experiment: getExperiment("proofs"),
	},
	{
		kind: "stripes",
		w: 1,
		h: 2,
		turns: true,
		experiment: getExperiment("wes-anderson"),
	},
	{
		kind: "quarter",
		w: 1,
		h: 1,
		turns: true,
		experiment: getExperiment("crdt"),
	},
	{
		kind: "arch",
		w: 2,
		h: 1,
		turns: true,
		experiment: getExperiment("deepseek"),
	},
	{
		kind: "triangles",
		w: 1,
		h: 1,
		turns: true,
		experiment: getExperiment("portfolio"),
	},
	{ kind: "count", w: 1, h: 1, turns: false },
	{ kind: "experiments", w: 2, h: 1, turns: false },
	{ kind: "blog", w: 2, h: 1, turns: false },
	{ kind: "library", w: 2, h: 1, turns: false },
];

export const initial: Place[] = [
	{ cell: 0, rot: 0 },
	{ cell: 2, rot: 0 },
	{ cell: 3, rot: 0 },
	{ cell: 10, rot: 0 },
	{ cell: 14, rot: 0 },
	{ cell: 7, rot: 0 },
	{ cell: 8, rot: 0 },
	{ cell: 12, rot: 0 },
	{ cell: 16, rot: 0 },
];

export const resetCode = String.fromCodePoint(BASE + RESET);

export function size(piece: Piece, rot: number) {
	return rot % 2 ? { w: piece.h, h: piece.w } : { w: piece.w, h: piece.h };
}

export function footprint(piece: Piece, place: Place) {
	const { w, h } = size(piece, place.rot);
	const row = Math.floor(place.cell / COLS);
	const col = place.cell % COLS;
	if (row + h > ROWS || col + w > COLS) return null;
	const cells: number[] = [];
	for (let r = row; r < row + h; r++) {
		for (let c = col; c < col + w; c++) cells.push(r * COLS + c);
	}
	return cells;
}

export function occupied(layout: Place[], except?: number) {
	const taken = new Set<number>();
	layout.forEach((place, index) => {
		if (index === except) return;
		const piece = pieces[index];
		if (!piece) return;
		for (const cell of footprint(piece, place) ?? []) taken.add(cell);
	});
	return taken;
}

export function fits(layout: Place[], index: number, place: Place) {
	const piece = pieces[index];
	if (!piece || place.cell < 0 || place.cell >= COLS * ROWS) return false;
	const cells = footprint(piece, place);
	if (!cells) return false;
	const taken = occupied(layout, index);
	return cells.every((cell) => !taken.has(cell));
}

export function anchorFor(
	layout: Place[],
	index: number,
	cell: number,
	rot: number,
) {
	const piece = pieces[index];
	if (!piece) return null;
	const { w, h } = size(piece, rot);
	const row = Math.floor(cell / COLS);
	const col = cell % COLS;
	for (let dr = 0; dr < h; dr++) {
		for (let dc = 0; dc < w; dc++) {
			const r = row - dr;
			const c = col - dc;
			if (r < 0 || c < 0) continue;
			const place = { cell: r * COLS + c, rot };
			if (fits(layout, index, place)) return place;
		}
	}
	return null;
}

export function encode(index: number, place: Place) {
	return String.fromCodePoint(
		BASE + index * STRIDE + place.cell * 4 + place.rot,
	);
}

export function fold(log: string) {
	let layout = initial.map((place) => ({ ...place }));
	for (const char of log) {
		const code = (char.codePointAt(0) ?? 0) - BASE;
		if (code < 0 || code > RESET) continue;
		if (code === RESET) {
			layout = initial.map((place) => ({ ...place }));
			continue;
		}
		const index = Math.floor(code / STRIDE);
		const place = { cell: (code % STRIDE) >> 2, rot: code & 3 };
		if (index >= pieces.length || !fits(layout, index, place)) continue;
		layout[index] = place;
	}
	return layout;
}

export function isInitial(layout: Place[]) {
	return layout.every(
		(place, index) =>
			place.cell === initial[index]?.cell && place.rot === initial[index]?.rot,
	);
}
