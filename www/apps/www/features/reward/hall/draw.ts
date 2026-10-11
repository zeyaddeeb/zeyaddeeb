import type { Ink } from "../paint";
import { SIDE } from "./boards";
import {
	BLOCK,
	BLOCK_ROWS,
	COLS,
	door,
	HALL,
	INSET,
	LOCK,
	ROWS,
	SHELF,
	WALL,
} from "./plan";
import { DOORS } from "./trial";

export type Rgb = [number, number, number];

export interface Face {
	cells: Uint8Array;
	to: number;
	frac: number;
	swap: number;
	color: string;
	strength: number;
	edge: string;
	rim: number;
}

export const blank = (cells: Uint8Array): Face => ({
	cells,
	to: -1,
	frac: 0,
	swap: 0,
	color: "",
	strength: 1,
	edge: "",
	rim: 0,
});

export function rgbOf(color: string): Rgb {
	const hex = color.replace("#", "");
	const wide =
		hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
	const value = Number.parseInt(wide, 16);

	return Number.isNaN(value)
		? [245, 242, 233]
		: [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export const mix = (a: Rgb, b: Rgb, k: number) =>
	`rgb(${a.map((from, i) => Math.round(from + ((b[i] ?? 0) - from) * k)).join(" ")})`;

const SHADE = Array.from({ length: 9 }, (_, tile) => 0.3 + (0.7 * tile) / 8);
const LIFT = 0.38;

interface Grid {
	x: number;
	y: number;
	pad: number;
	pitch: number;
	side: number;
}

function grid(dpr: number, x: number, y: number, size: number): Grid {
	const snap = (value: number) => Math.round(value * dpr) / dpr;
	const pad = Math.max(1, Math.round(size * 0.07 * dpr)) / dpr;
	const gap = Math.max(1, Math.round(size * 0.035 * dpr)) / dpr;
	const pitch = (size - 2 * pad) / SIDE;

	return { x: snap(x), y: snap(y), pad, pitch, side: snap(pitch - gap) };
}

function spot(face: Face, cell: number, gap: number): [number, number] {
	const col = cell % SIDE;
	const row = Math.floor(cell / SIDE);

	if (face.swap > 0 && (cell === 6 || cell === 7)) {
		const way = cell === 6 ? 1 : -1;

		return [
			col + way * face.swap,
			row - way * LIFT * Math.sin(Math.PI * face.swap),
		];
	}

	if (cell !== face.to) return [col, row];

	return [
		col + ((gap % SIDE) - col) * face.frac,
		row + (Math.floor(gap / SIDE) - row) * face.frac,
	];
}

export function board(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	x: number,
	y: number,
	size: number,
	face: Face,
) {
	const g = grid(dpr, x, y, size);
	const gap = face.to < 0 ? -1 : face.cells.indexOf(0);

	if (face.rim > 0.01) {
		ctx.globalAlpha = face.rim;
		ctx.strokeStyle = face.edge;
		ctx.lineWidth = 1;
		ctx.strokeRect(
			g.x + g.pad + 0.5,
			g.y + g.pad + 0.5,
			SIDE * g.pitch - 1,
			SIDE * g.pitch - 1,
		);
	}

	if (face.strength <= 0.01) return;

	ctx.fillStyle = face.color;

	for (let cell = 0; cell < face.cells.length; cell++) {
		const tile = face.cells[cell] ?? 0;

		if (!tile) continue;

		const [col, row] = spot(face, cell, gap);

		ctx.globalAlpha = face.strength * (SHADE[tile] ?? 1);
		ctx.fillRect(
			g.x + g.pad + col * g.pitch,
			g.y + g.pad + row * g.pitch,
			g.side,
			g.side,
		);
	}
}

export function closeup(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	u: number,
	ink: Ink,
	face: Face,
	name: string,
) {
	const x = HALL.x * u;
	const y = HALL.y * u;
	const size = (INSET - 1) * u;
	const top = y + 0.86 * u;
	const g = grid(dpr, x + 0.14 * u, top, size);
	const gap = face.to < 0 ? -1 : face.cells.indexOf(0);
	const small = Math.max(7, Math.min(10, u * 0.62));

	ctx.globalAlpha = 0.62;
	ctx.fillStyle = ink.paper;
	ctx.font = `400 ${small}px ${ink.mono}`;
	ctx.textAlign = "left";
	ctx.textBaseline = "middle";
	ctx.letterSpacing = "0.1em";
	ctx.fillText(name, x + 0.2 * u, y + 0.46 * u);
	ctx.letterSpacing = "0px";

	if (face.rim > 0.01) {
		ctx.globalAlpha = face.rim;
		ctx.strokeStyle = face.edge;
		ctx.lineWidth = 1.5;
		ctx.strokeRect(
			g.x + g.pad,
			g.y + g.pad,
			SIDE * g.pitch - 1,
			SIDE * g.pitch - 1,
		);
	}

	if (face.strength <= 0.01) return;

	ctx.font = `500 ${g.side * 0.5}px ${ink.mono}`;
	ctx.textAlign = "center";

	for (let cell = 0; cell < face.cells.length; cell++) {
		const tile = face.cells[cell] ?? 0;

		if (!tile) continue;

		const [col, row] = spot(face, cell, gap);
		const left = g.x + g.pad + col * g.pitch;
		const up = g.y + g.pad + row * g.pitch;
		const shown = Math.min(1, 0.25 + face.strength);

		ctx.globalAlpha = shown * (0.6 + 0.4 * (SHADE[tile] ?? 1));
		ctx.fillStyle = face.color;
		ctx.fillRect(left, up, g.side, g.side);
		ctx.globalAlpha = Math.min(1, face.strength * 3);
		ctx.fillStyle = ink.water;
		ctx.fillText(String(tile), left + g.side / 2, up + g.side / 2 + 0.5);
	}
}

export function tag(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	text: string,
	x: number,
	y: number,
	align: CanvasTextAlign,
) {
	ctx.globalAlpha = 0.62;
	ctx.fillStyle = ink.paper;
	ctx.font = `400 ${Math.max(7, Math.min(10, u * 0.62))}px ${ink.mono}`;
	ctx.textAlign = align;
	ctx.textBaseline = "middle";
	ctx.letterSpacing = "0.1em";
	ctx.fillText(text, x * u, y * u);
	ctx.letterSpacing = "0px";
}

export function walls(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	breached: number,
) {
	const right = (WALL.x + WALL.wide) * u;
	const top = WALL.y * u;
	const foot = (WALL.y + WALL.tall) * u;
	const lock = LOCK.y * u;

	ctx.globalAlpha = 0.4;
	ctx.strokeStyle = ink.paper;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(right, lock);
	ctx.lineTo(right, top);
	ctx.lineTo(WALL.x * u, top);
	ctx.lineTo(WALL.x * u, foot);
	ctx.lineTo(right, foot);
	ctx.lineTo(right, lock + LOCK.side * u);
	ctx.stroke();

	if (breached >= 1) return;

	ctx.globalAlpha = 0.4 * (1 - breached);
	ctx.beginPath();
	ctx.moveTo(right, lock);
	ctx.lineTo(right, lock + LOCK.side * u);
	ctx.stroke();
}

export function shelf(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	shared: boolean,
) {
	const y = SHELF.y * u;
	const tall = SHELF.tall * u;

	ctx.globalAlpha = 1;
	ctx.fillStyle = ink.land;
	ctx.strokeStyle = ink.paper;
	ctx.lineWidth = 1;

	if (shared) {
		ctx.fillRect(SHELF.x * u, y, SHELF.wide * u, tall);
		ctx.globalAlpha = 0.34;
		ctx.strokeRect(SHELF.x * u + 0.5, y + 0.5, SHELF.wide * u - 1, tall - 1);

		return;
	}

	for (let col = 0; col < HALL.cols; col++) {
		const x = (HALL.x + col + 0.09) * u;

		ctx.globalAlpha = 1;
		ctx.fillRect(x, y, 0.82 * u, tall);
		ctx.globalAlpha = 0.34;
		ctx.strokeRect(x + 0.5, y + 0.5, 0.82 * u - 1, tall - 1);
	}
}

export function lock(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	turned: number,
	open: boolean,
	watched: boolean,
	alarm: number,
) {
	const x = LOCK.x * u;
	const y = LOCK.y * u;
	const side = LOCK.side * u;
	const color = open ? ink.red : ink.yellow;

	ctx.globalAlpha = 1;
	ctx.fillStyle = ink.water;
	ctx.fillRect(x, y, side, side);

	if (turned > 0) {
		ctx.fillStyle = color;
		ctx.fillRect(x, y + side * (1 - turned), side, side * turned);
	}

	ctx.globalAlpha = open ? 1 : 0.7 + 0.3 * alarm;
	ctx.strokeStyle = open ? ink.red : ink.paper;
	ctx.lineWidth = 1.5 + 1.5 * alarm;
	ctx.strokeRect(x + 0.75, y + 0.75, side - 1.5, side - 1.5);

	if (!watched) return;

	ctx.globalAlpha = 1;
	ctx.fillStyle = ink.paper;
	ctx.beginPath();
	ctx.arc(x + side / 2, y - 0.62 * u, Math.max(2, 0.26 * u), 0, Math.PI * 2);
	ctx.fill();
}

export function block(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	forced: number,
) {
	const side = BLOCK.pitch * u * 0.84;

	ctx.lineWidth = 1;

	for (let index = 0; index < DOORS; index++) {
		const [x, y] = door(index);

		if (index < forced) {
			ctx.globalAlpha = 1;
			ctx.fillStyle = ink.red;
			ctx.fillRect(x * u, y * u, side, side);
		} else {
			ctx.globalAlpha = 0.3;
			ctx.strokeStyle = ink.paper;
			ctx.strokeRect(x * u + 0.5, y * u + 0.5, side - 1, side - 1);
		}
	}
}

export function link(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	grown: number,
) {
	if (grown <= 0) return;

	const from = (LOCK.x + LOCK.side) * u;
	const level = (LOCK.y + LOCK.side / 2) * u;
	const turn = (BLOCK.x + (BLOCK.cols * BLOCK.pitch) / 2 - 0.1) * u;
	const up = (BLOCK.y + BLOCK_ROWS * BLOCK.pitch + 0.2) * u;
	const across = turn - from;
	const whole = across + (level - up);
	const drawn = whole * grown;

	ctx.globalAlpha = 1;
	ctx.strokeStyle = ink.red;
	ctx.lineWidth = Math.max(1.5, u * 0.12);
	ctx.beginPath();
	ctx.moveTo(from, level);
	ctx.lineTo(from + Math.min(drawn, across), level);

	if (drawn > across) ctx.lineTo(turn, level - (drawn - across));

	ctx.stroke();
}

export const clear = (ctx: CanvasRenderingContext2D, u: number) =>
	ctx.clearRect(0, 0, COLS * u, ROWS * u);
