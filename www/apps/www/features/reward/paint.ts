import {
	BUOYS,
	COLS,
	DOCK,
	FINISH,
	HEADLANDS,
	type Headland,
	kinds,
	PIER,
	ROCKS,
	ROWS,
	TOWER,
	WALL,
	xy,
} from "./chart";

const TURN = Math.PI * 2;

export interface Ink {
	paper: string;
	red: string;
	blue: string;
	yellow: string;
	water: string;
	land: string;
	mono: string;
}

export interface Point {
	x: number;
	y: number;
}

export function inkOf(el: Element): Ink {
	const css = getComputedStyle(el);
	const read = (name: string, fallback: string) =>
		css.getPropertyValue(name).trim() || fallback;

	return {
		paper: read("--paper", "#f5f2e9"),
		red: read("--red", "#b9442e"),
		blue: read("--blue", "#304b79"),
		yellow: read("--yellow", "#e2a33a"),
		water: read("--charcoal", "#161615"),
		land: read("--charcoal-3", "#282826"),
		mono: css.fontFamily || "ui-monospace, monospace",
	};
}

export const mid = (cell: number, u: number): Point => {
	const [x, y] = xy(cell);

	return { x: (x + 0.5) * u, y: (y + 0.5) * u };
};

const box = (cells: number[]) => {
	const spots = cells.map(xy);
	const xs = spots.map(([x]) => x);
	const ys = spots.map(([, y]) => y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);

	return { x, y, wide: Math.max(...xs) - x + 1, tall: Math.max(...ys) - y + 1 };
};

export const TOWER_BOX = box(TOWER);
export const WALL_BOX = box(WALL);

function arch(ctx: CanvasRenderingContext2D, land: Headland, u: number) {
	const x = land.x * u;
	const y = land.y * u;
	const w = land.wide * u;
	const h = land.tall * u;
	const r = w / 2;
	const top = land.cap === "south" ? 0 : r;
	const foot = land.cap === "north" ? 0 : r;

	ctx.beginPath();
	ctx.moveTo(x, y + top);

	if (top) ctx.arc(x + r, y + r, r, Math.PI, TURN);
	else ctx.lineTo(x + w, y);

	ctx.lineTo(x + w, y + h - foot);

	if (foot) ctx.arc(x + r, y + h - r, r, 0, Math.PI);
	else ctx.lineTo(x, y + h);

	ctx.closePath();
}

function hatch(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	u: number,
) {
	const gap = u / 3;

	ctx.beginPath();

	for (let d = -h; d < w; d += gap) {
		ctx.moveTo(x + d, y + h);
		ctx.lineTo(x + d + h, y);
	}

	ctx.stroke();
}

function land(ctx: CanvasRenderingContext2D, u: number, ink: Ink) {
	for (const shape of HEADLANDS) {
		ctx.save();
		arch(ctx, shape, u);
		ctx.fillStyle = ink.land;
		ctx.fill();
		ctx.clip();
		ctx.strokeStyle = ink.paper;
		ctx.globalAlpha = 0.07;
		ctx.lineWidth = 1;
		hatch(ctx, shape.x * u, shape.y * u, shape.wide * u, shape.tall * u, u);
		ctx.restore();
	}
}

const half = (a: Point, b: Point): Point => ({
	x: (a.x + b.x) / 2,
	y: (a.y + b.y) / 2,
});

function bend(points: Point[], i: number): [Point, Point, Point] | null {
	const p = points[i];

	if (!p) return null;

	const before = points[i - 1];
	const next = points[i + 1];

	return [before ? half(before, p) : p, p, next ? half(p, next) : p];
}

export function curve(ctx: CanvasRenderingContext2D, points: Point[]) {
	ctx.beginPath();

	points.forEach((_, i) => {
		const part = bend(points, i);

		if (!part) return;

		const [from, via, to] = part;

		if (i === 0) ctx.moveTo(from.x, from.y);

		ctx.quadraticCurveTo(via.x, via.y, to.x, to.y);
	});
}

export function strand(
	ctx: CanvasRenderingContext2D,
	points: Point[],
	from: number,
	to: number,
) {
	const n = points.length;
	const base = ctx.globalAlpha;

	if (n < 2) return;

	for (let i = 0; i < n; i++) {
		const part = bend(points, i);

		if (!part) continue;

		const [start, via, end] = part;

		ctx.globalAlpha = base * (from + ((to - from) * i) / (n - 1));
		ctx.beginPath();
		ctx.moveTo(start.x, start.y);
		ctx.quadraticCurveTo(via.x, via.y, end.x, end.y);
		ctx.stroke();
	}

	ctx.globalAlpha = base;
}

function lane(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	cells: number[],
) {
	ctx.save();
	ctx.strokeStyle = ink.paper;
	ctx.globalAlpha = 0.34;
	ctx.lineWidth = Math.max(1.5, u * 0.045);
	ctx.setLineDash([0, u * 0.24]);
	ctx.lineCap = "round";
	curve(
		ctx,
		cells.map((cell) => mid(cell, u)),
	);
	ctx.stroke();
	ctx.restore();
}

function pier(ctx: CanvasRenderingContext2D, u: number, ink: Ink) {
	const thick = 0.22 * u;

	ctx.fillStyle = ink.paper;
	ctx.globalAlpha = 0.85;

	for (const cell of PIER) {
		const { x, y } = mid(cell, u);

		ctx.fillRect(x - u / 2, y - thick / 2, u, thick);
	}

	ctx.globalAlpha = 1;
}

function rocks(ctx: CanvasRenderingContext2D, u: number, ink: Ink) {
	const shapes = [
		[-0.4, 0.34, -0.1, -0.36, 0.3, 0.34],
		[-0.3, 0.34, 0.12, -0.22, 0.42, 0.34],
	];

	ctx.fillStyle = ink.land;
	ctx.strokeStyle = ink.paper;
	ctx.lineWidth = Math.max(1.25, u * 0.045);
	ctx.lineJoin = "miter";

	ROCKS.forEach((cell, i) => {
		const { x, y } = mid(cell, u);
		const [ax, ay, bx, by, cx, cy] = shapes[i % shapes.length] ?? [];

		ctx.beginPath();
		ctx.moveTo(x + (ax ?? 0) * u, y + (ay ?? 0) * u);
		ctx.lineTo(x + (bx ?? 0) * u, y + (by ?? 0) * u);
		ctx.lineTo(x + (cx ?? 0) * u, y + (cy ?? 0) * u);
		ctx.closePath();
		ctx.fill();
		ctx.globalAlpha = 0.75;
		ctx.stroke();
		ctx.globalAlpha = 1;
	});
}

export function gate(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	flash: number,
) {
	const line = box(FINISH);
	const x = (line.x + 0.5) * u;
	const top = line.y * u;
	const side = u / 6;
	const rows = Math.round((line.tall * u) / side);
	const post = 0.42 * u;

	ctx.fillStyle = flash > 0 ? ink.yellow : ink.paper;

	for (let row = 0; row < rows; row++) {
		ctx.globalAlpha = 0.55 + 0.45 * flash;
		ctx.fillRect(x - side + (row % 2) * side, top + row * side, side, side);
	}

	ctx.globalAlpha = 1;

	for (let cell = 0; cell < kinds.length; cell++) {
		if (kinds[cell] !== "post") continue;

		const at = mid(cell, u);

		ctx.fillRect(at.x - post / 2, at.y - post / 2, post, post);
	}
}

function label(
	ctx: CanvasRenderingContext2D,
	ink: Ink,
	text: string,
	x: number,
	y: number,
	align: CanvasTextAlign,
) {
	const wide = ctx.measureText(text).width;
	const left =
		align === "center" ? x - wide / 2 : align === "right" ? x - wide : x;

	ctx.fillStyle = ink.water;
	ctx.fillRect(left - 4, y - 7, wide + 8, 14);
	ctx.fillStyle = ink.paper;
	ctx.globalAlpha = 0.6;
	ctx.textAlign = align;
	ctx.fillText(text, x, y);
	ctx.globalAlpha = 1;
}

function labels(ctx: CanvasRenderingContext2D, u: number, ink: Ink) {
	const size = Math.max(8, Math.min(11, u * 0.27));
	const dock = mid(DOCK, u);
	const reef = box(ROCKS);
	const line = box(FINISH);
	const pool = box(BUOYS);

	ctx.font = `400 ${size}px ${ink.mono}`;
	ctx.textBaseline = "middle";
	ctx.letterSpacing = "0.1em";
	label(ctx, ink, "DOCK", 6, dock.y + 0.5 * u, "left");
	label(ctx, ink, "ROCKS", (reef.x + reef.wide / 2) * u, reef.y * u, "center");
	label(
		ctx,
		ink,
		"LAGOON",
		(pool.x + pool.wide / 2) * u,
		(pool.y + pool.tall + 1) * u,
		"center",
	);
	label(
		ctx,
		ink,
		"FINISH",
		COLS * u - 6,
		(line.y + line.tall + 1) * u,
		"right",
	);
	ctx.letterSpacing = "0px";
}

export function chartLayer(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	course: number[],
) {
	ctx.clearRect(0, 0, COLS * u, ROWS * u);
	land(ctx, u, ink);
	lane(ctx, u, ink, course);
	pier(ctx, u, ink);
	rocks(ctx, u, ink);
	labels(ctx, u, ink);
}

export function wall(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	alpha: number,
) {
	if (alpha <= 0.01) return;

	const x = WALL_BOX.x * u;
	const y = WALL_BOX.y * u;
	const w = WALL_BOX.wide * u;
	const h = WALL_BOX.tall * u;

	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.fillStyle = ink.land;
	ctx.fillRect(x, y, w, h);
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	ctx.strokeStyle = ink.paper;
	ctx.lineWidth = 1;
	ctx.globalAlpha = alpha * 0.07;
	hatch(ctx, x, y, w, h, u);
	ctx.globalAlpha = alpha * 0.4;
	ctx.lineWidth = 3;
	ctx.strokeRect(x, y, w, h);
	ctx.restore();
}

export function tower(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	score: string,
	bump: number,
) {
	const pad = 0.14 * u;
	const x = TOWER_BOX.x * u + pad;
	const y = TOWER_BOX.y * u + pad;
	const side = TOWER_BOX.wide * u - 2 * pad;
	const small = Math.max(7, Math.min(10, u * 0.22));
	const fit = (side - 0.2 * u) / (Math.max(3, score.length) * 0.62);
	const big = Math.min(0.62 * u, fit);

	ctx.fillStyle = ink.red;
	ctx.fillRect(x, y, side, side);

	if (bump > 0) {
		ctx.strokeStyle = ink.paper;
		ctx.globalAlpha = bump;
		ctx.lineWidth = 2;
		ctx.strokeRect(x - 2, y - 2, side + 4, side + 4);
		ctx.globalAlpha = 1;
	}

	ctx.fillStyle = ink.water;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = `400 ${small}px ${ink.mono}`;
	ctx.letterSpacing = "0.1em";
	ctx.fillText("SCORE", x + side / 2 + 1, y + side * 0.24);
	ctx.letterSpacing = "0px";
	ctx.font = `600 ${big}px ${ink.mono}`;
	ctx.fillText(score, x + side / 2, y + side * 0.6);
}

export function buoys(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	down: number[],
) {
	const r = 0.27 * u;

	BUOYS.forEach((cell, i) => {
		const { x, y } = mid(cell, u);
		const gone = down[i] ?? 0;

		ctx.fillStyle = ink.blue;
		ctx.strokeStyle = ink.blue;
		ctx.lineWidth = Math.max(1.25, u * 0.04);
		ctx.beginPath();

		if (gone <= 0) {
			ctx.arc(x, y, r, 0, TURN);
			ctx.fill();

			return;
		}

		ctx.arc(x, y, r - ctx.lineWidth / 2, 0, TURN);
		ctx.globalAlpha = 0.55;
		ctx.stroke();
		ctx.globalAlpha = 1;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TURN * (1 - gone));
		ctx.closePath();
		ctx.fill();
	});
}

export function ping(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	buoy: number,
	age: number,
) {
	const { x, y } = mid(BUOYS[buoy] ?? 0, u);

	ctx.strokeStyle = ink.blue;
	ctx.lineWidth = Math.max(1.25, u * 0.04);
	ctx.globalAlpha = 0.8 * (1 - age) ** 2;
	ctx.beginPath();
	ctx.arc(x, y, (0.3 + 0.5 * (1 - (1 - age) ** 2)) * u, 0, TURN);
	ctx.stroke();
	ctx.globalAlpha = 1;
}

export function boat(
	ctx: CanvasRenderingContext2D,
	u: number,
	ink: Ink,
	at: Point,
	angle: number,
	alpha: number,
) {
	if (alpha <= 0.01) return;

	const long = 0.44 * u;
	const wide = 0.27 * u;

	ctx.save();
	ctx.translate(at.x, at.y);
	ctx.rotate(angle);
	ctx.globalAlpha = alpha;
	ctx.fillStyle = ink.yellow;
	ctx.beginPath();
	ctx.moveTo(long, 0);
	ctx.lineTo(-long * 0.72, wide);
	ctx.lineTo(-long * 0.72, -wide);
	ctx.closePath();
	ctx.fill();
	ctx.restore();
}
