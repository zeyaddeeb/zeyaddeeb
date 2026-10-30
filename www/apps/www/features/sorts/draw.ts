import {
	AIMED,
	ease,
	FLOOR,
	type Game,
	LOOSEN,
	layout,
	lineY,
	loaded,
	MIN_COLS,
	RELOAD,
	ROWS,
} from "./game";
import { bodyOf, type Kind, size } from "./sorts";

export interface Palette {
	paper: string;
	ink: string;
	red: string;
	blue: string;
}

export interface View {
	width: number;
	height: number;
	dpr: number;
	cell: number;
	cols: number;
	ox: number;
	oy: number;
	grid: HTMLCanvasElement | null;
}

const TAU = Math.PI * 2;
const REVEAL = 0.16;

export const tone: Record<Kind, keyof Palette> = {
	ring: "blue",
	arch: "red",
	tall: "ink",
	short: "ink",
	dot: "red",
};

export function readPalette(element: Element): Palette {
	const style = getComputedStyle(element);
	const pick = (name: string, fallback: string) =>
		style.getPropertyValue(name).trim() || fallback;

	return {
		paper: pick("--paper", "#f9f8f2"),
		ink: pick("--ink", "#111111"),
		red: pick("--red", "#e83025"),
		blue: pick("--blue", "#0089c8"),
	};
}

export function measure(width: number, height: number, dpr: number): View {
	const cell = Math.min(height / (ROWS + 2), width / MIN_COLS);
	const cols = Math.max(MIN_COLS, Math.floor(width / cell));

	return {
		width,
		height,
		dpr,
		cell,
		cols,
		ox: (width - cols * cell) / 2,
		oy: (height - ROWS * cell) / 2,
		grid: null,
	};
}

export function paintGrid(view: View, palette: Palette) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	canvas.width = Math.round(view.width * view.dpr);
	canvas.height = Math.round(view.height * view.dpr);

	if (!ctx) return canvas;

	const { cell, ox, oy, dpr } = view;
	const arm = Math.max(1.5, cell * 0.14);
	const first = -Math.ceil(ox / cell / 2) * 2;
	const last = Math.ceil((view.width - ox) / cell);
	const top = -Math.ceil(oy / cell / 2) * 2;
	const bottom = Math.ceil((view.height - oy) / cell);

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.fillStyle = palette.paper;
	ctx.fillRect(0, 0, view.width, view.height);
	ctx.strokeStyle = palette.ink;
	ctx.globalAlpha = 0.22;
	ctx.lineWidth = 1;
	ctx.beginPath();

	for (let c = first; c <= last; c += 2)
		for (let r = top; r <= bottom; r += 2) {
			const x = Math.round(ox + c * cell) + 0.5;
			const y = Math.round(oy + r * cell) + 0.5;

			ctx.moveTo(x - arm, y);
			ctx.lineTo(x + arm, y);
			ctx.moveTo(x, y - arm);
			ctx.lineTo(x, y + arm);
		}

	ctx.stroke();

	return canvas;
}

export function shape(
	ctx: CanvasRenderingContext2D,
	kind: Kind,
	rot: number,
	x: number,
	y: number,
) {
	const foot = size(kind, rot);
	const { w, h } = bodyOf(kind);

	ctx.save();
	ctx.translate(x + foot.w / 2, y + foot.h / 2);
	ctx.rotate((rot * Math.PI) / 2);
	ctx.translate(-w / 2, -h / 2);
	ctx.beginPath();

	if (kind === "ring") {
		ctx.arc(1.5, 1.5, 1.5, 0, TAU);
		ctx.moveTo(2, 1.5);
		ctx.arc(1.5, 1.5, 0.5, 0, TAU, true);
	} else if (kind === "arch") {
		ctx.moveTo(0, 3);
		ctx.lineTo(0, 1.5);
		ctx.arc(1.5, 1.5, 1.5, Math.PI, 0);
		ctx.lineTo(3, 3);
		ctx.lineTo(2, 3);
		ctx.lineTo(2, 1.5);
		ctx.arc(1.5, 1.5, 0.5, 0, Math.PI, true);
		ctx.lineTo(1, 3);
		ctx.closePath();
	} else if (kind === "dot") {
		ctx.arc(0.5, 0.5, 0.5, 0, TAU);
	} else {
		ctx.rect(0, 0, w, h);
	}

	ctx.fill();
	ctx.restore();
}

function guides(ctx: CanvasRenderingContext2D, view: View, top: number) {
	const { cell, ox } = view;
	const left = -ox / cell;
	const right = (view.width - ox) / cell;
	const hair = 1 / cell;

	for (const y of [top + 2, top + 5])
		ctx.fillRect(left, y - hair / 2, right - left, hair);
}

export function draw(
	ctx: CanvasRenderingContext2D,
	game: Game,
	view: View,
	palette: Palette,
) {
	const { dpr, cell, ox, oy } = view;
	const t = game.t;

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalCompositeOperation = "source-over";
	ctx.globalAlpha = 1;

	if (view.grid) ctx.drawImage(view.grid, 0, 0);
	else {
		ctx.fillStyle = palette.paper;
		ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	}

	ctx.setTransform(dpr * cell, 0, 0, dpr * cell, dpr * ox, dpr * oy);
	ctx.fillStyle = palette.red;
	ctx.globalAlpha = 0.4;

	for (const line of game.lines) guides(ctx, view, lineY(game, line));

	guides(ctx, view, FLOOR);
	ctx.globalCompositeOperation = "multiply";

	for (const spot of layout(game)) {
		if (!spot.shown) continue;

		const settle = game.still ? 1 : ease(spot.age / REVEAL);

		ctx.globalAlpha = settle;

		for (const sort of spot.letter.sorts) {
			const loose = spot.letter.loose.find((item) => item.sort === sort);
			const due = loose ? (t - loose.at) / (loose.tittle ? AIMED : LOOSEN) : 0;
			const shake = loose
				? Math.sin(t * 70) * 0.07 * Math.min(1, due + 0.3)
				: 0;

			ctx.fillStyle = palette[tone[sort.kind]];
			shape(
				ctx,
				sort.kind,
				sort.rot,
				spot.x + sort.x + shake,
				spot.y + sort.y - (1 - settle) * 0.35,
			);
		}
	}

	ctx.globalAlpha = 1;

	for (const item of game.falling) {
		ctx.fillStyle = palette[tone[item.kind]];
		shape(ctx, item.kind, item.rot, item.x, item.y);
	}

	ctx.globalCompositeOperation = "source-over";
	ctx.globalAlpha = t < game.mercy ? 0.35 : 1;
	ctx.fillStyle = palette.ink;
	shape(ctx, "short", 0, game.x, FLOOR + 2);

	if (loaded(game)) {
		ctx.globalAlpha *= ease((t - game.loaded) / RELOAD);
		ctx.fillStyle = palette.red;
		shape(ctx, "dot", 0, game.x, FLOOR);
	}

	ctx.globalAlpha = 1;

	if (game.shot) {
		ctx.fillStyle = palette.red;
		shape(ctx, "dot", 0, game.shot.x - 0.5, game.shot.y - 0.5);
	}
}
