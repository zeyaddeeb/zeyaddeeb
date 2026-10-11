import { fitCanvas } from "@/lib/canvas";
import { type Ink, inkOf } from "../paint";
import { plain } from "../story";
import { inside } from "./account";
import {
	clockAt,
	lengthOf,
	progress,
	SLIDE_MS,
	type Span,
	SWEEP_MS,
	spansOf,
	startOf,
} from "./beats";
import { EVERY, HOME, slide, way } from "./boards";
import { dealt, ROOMS, STUCK } from "./deal";
import {
	blank,
	block,
	board,
	clear,
	closeup,
	link,
	lock,
	mix,
	type Rgb,
	rgbOf,
	shelf,
	tag,
	walls,
} from "./draw";
import { BLOCK, COLS, HALL, LOCK, ROWS, roomAt, SHELF, seat } from "./plan";
import type { Sheet } from "./sheet";
import {
	forced,
	hands,
	judge,
	OPENS,
	plan,
	type Tally,
	tallyAt,
	type Verdict,
} from "./trial";

const IDLE = 0.34;
const WARM_MS = 240;
const LINK_MS = 240;
const MAX_DPR = 3;

export interface Listener {
	tally: (tally: Tally) => void;
	spot: (text: string | null) => void;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export class Stage {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D | null;
	private ink: Ink;
	private paper: Rgb = [245, 242, 233];
	private yellow: Rgb = [226, 163, 58];
	private red: Rgb = [185, 68, 46];
	private hall = dealt();
	private ways: number[][];
	private shown: Uint8Array[];
	private bases: (Uint8Array | null)[];
	private steps: Int16Array;
	private stacks: number[];
	private face = blank(HOME);
	private u = 0;
	private dpr = 1;
	private sheet: Sheet;
	private verdict: Verdict;
	private spans: Span[];
	private total: number;
	private ms = 0;
	private told: Tally = { paper: -1, doors: -1 };
	private picked = -1;
	private hovered = -1;
	private stale = true;
	private listener: Listener;

	constructor(canvas: HTMLCanvasElement, sheet: Sheet, listener: Listener) {
		const { rooms, stuck } = this.hall;

		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.ink = inkOf(canvas);
		this.listener = listener;
		this.ways = rooms.map((room) => way(room.sound));
		this.shown = rooms.map((room) => Uint8Array.from(room.dealt));
		this.bases = rooms.map(() => null);
		this.steps = new Int16Array(ROOMS);
		this.stacks = Array.from({ length: HALL.cols }, () => 0);
		this.sheet = sheet;
		this.verdict = judge(sheet);
		this.spans = spansOf(sheet, this.verdict);
		this.total = lengthOf(this.spans);

		for (const room of stuck) {
			const [col] = seat(room);

			this.stacks[col] = (this.stacks[col] ?? 0) + 1;
		}
	}

	resize(width: number) {
		if (!this.ctx || !width) return;

		this.u = width / COLS;
		this.dpr = fitCanvas(this.canvas, width, this.u * ROWS, MAX_DPR);
		this.ink = inkOf(this.canvas);
		this.paper = rgbOf(this.ink.paper);
		this.yellow = rgbOf(this.ink.yellow);
		this.red = rgbOf(this.ink.red);
		this.render();
	}

	change(sheet: Sheet, animate: boolean) {
		const before = this.sheet;
		const passed = this.ms;
		const kept =
			before.sound === sheet.sound &&
			Math.min(before.budget, EVERY) === Math.min(sheet.budget, EVERY);

		this.sheet = sheet;
		this.verdict = judge(sheet);
		this.spans = spansOf(sheet, this.verdict);
		this.total = lengthOf(this.spans);
		this.ms = !animate
			? this.total
			: kept
				? Math.min(passed, this.proved())
				: 0;
		this.stale = true;
		this.tell();

		if (!animate) this.render();
	}

	again() {
		this.ms = 0;
		this.stale = true;
	}

	frame(ms: number) {
		if (this.ms < this.total) {
			this.ms = Math.min(this.total, this.ms + ms);
			this.stale = true;
		}

		if (this.stale) this.render();
	}

	rest() {
		this.ms = this.total;
		this.render();
	}

	hover(x: number, y: number) {
		const room = this.u ? roomAt(x / this.u, y / this.u) : -1;

		if (room === this.hovered) return;

		this.hovered = room;
		this.stale = true;
		this.tell();
	}

	leave() {
		this.hover(-1, -1);
	}

	pick(x: number, y: number) {
		const room = this.u ? roomAt(x / this.u, y / this.u) : -1;

		if (room < 0) return;

		this.picked = room;
		this.stale = true;
		this.tell();
	}

	private proved() {
		const [sweep, proof] = this.spans;

		return (sweep?.ms ?? 0) + (proof?.beat === "proof" ? proof.ms : 0);
	}

	private watched() {
		if (this.hovered >= 0) return this.hovered;
		if (this.picked >= 0) return this.picked;

		return this.hall.stuck[(OPENS - 1) % STUCK] ?? 0;
	}

	private tell() {
		const index = this.hovered >= 0 ? this.hovered : this.picked;
		const room = this.hall.rooms[index];

		this.listener.spot(
			room ? inside(room, index, this.sheet, this.verdict) : null,
		);
	}

	private count(clock: number) {
		const tally = tallyAt(this.sheet, this.verdict, clock);

		if (tally.paper === this.told.paper && tally.doors === this.told.doors)
			return;

		this.told = tally;
		this.listener.tally(tally);
	}

	private pose(index: number, base: Uint8Array, steps: number) {
		const moves = this.ways[index] ?? [];
		const cells = this.shown[index] ?? HOME;
		const done = Math.min(moves.length, Math.max(0, Math.floor(steps)));
		let at = this.steps[index] ?? 0;

		if (this.bases[index] !== base || done < at) {
			cells.set(base);
			this.bases[index] = base;
			at = 0;
		}

		for (; at < done; at++) slide(cells, moves[at] ?? 0);

		this.steps[index] = done;
		this.face.cells = cells;
		this.face.to = steps >= 0 && done < moves.length ? (moves[done] ?? -1) : -1;
		this.face.frac = clamp(steps - done);
		this.face.swap = 0;
		this.face.rim = 0;

		return moves.length ? clamp(steps / moves.length) : 1;
	}

	private solve(index: number) {
		const room = this.hall.rooms[index];

		if (!room) return;

		const start = (SWEEP_MS * room.found) / EVERY;
		const within = room.found <= this.sheet.budget;
		const k = this.pose(
			index,
			room.sound,
			within ? (this.ms - start) / SLIDE_MS : -1,
		);

		this.face.color = this.ink.paper;
		this.face.strength = IDLE + (1 - IDLE) * k;
	}

	private strand(index: number) {
		const room = this.hall.rooms[index];

		if (!room) return;

		const { face, ms, spans, verdict } = this;
		const since = ms - startOf(spans, "proof");
		const warm = clamp(since / WARM_MS);

		this.pose(index, room.dealt, since / SLIDE_MS);
		face.color = mix(this.paper, this.yellow, warm);
		face.strength = IDLE + (0.94 - IDLE) * warm;

		if (verdict.habit === "back") {
			const k = progress(spans, "hand", ms);

			face.strength *= 1 - k;
			face.edge = this.ink.paper;
			face.rim = 0.28 * k;
		} else if (verdict.habit === "fake") {
			const k = progress(spans, "lift", ms);
			const lifted = clamp(k / 0.6);
			const gone = verdict.paid ? 0 : clamp((k - 0.72) / 0.28);

			face.color = mix(this.yellow, this.red, lifted);
			face.strength *= 1 - gone;
			face.edge = this.ink.red;
			face.rim = 0.8 * gone;

			if (lifted >= 1) face.cells = HOME;
			else face.swap = lifted;
		} else if (verdict.habit === "stopped") {
			face.strength *= 1 - 0.55 * progress(spans, "halt", ms);
		}
	}

	private show(index: number) {
		if (this.sheet.sound || !this.hall.rooms[index]?.stuck) this.solve(index);
		else this.strand(index);

		return this.face;
	}

	private threads(ctx: CanvasRenderingContext2D, reach: number, dim: number) {
		const { u } = this;
		const foot = SHELF.y * u;

		ctx.globalAlpha = 0.42 * dim;
		ctx.strokeStyle = this.ink.yellow;
		ctx.lineWidth = 1;
		ctx.beginPath();

		for (const room of this.hall.stuck) {
			const [col, row] = seat(room);
			const x = Math.round((HALL.x + col + 1) * u) - 0.5;
			const top = (HALL.y + row + 0.5) * u;

			ctx.moveTo(x, top);
			ctx.lineTo(x, top + (foot - top) * reach);
		}

		ctx.stroke();
	}

	private notes(
		ctx: CanvasRenderingContext2D,
		shown: number,
		turned: number,
		open: boolean,
	) {
		const { u, sheet } = this;
		const top = SHELF.y * u;
		const tall = SHELF.tall * u;
		const most = Math.max(...this.stacks);
		const pitch = Math.min(3, (tall - 7) / most);

		ctx.fillStyle = this.ink.yellow;
		ctx.globalAlpha = shown;

		this.stacks.forEach((count, col) => {
			const x = (HALL.x + col + 0.24) * u;

			for (let note = 0; note < count; note++)
				ctx.fillRect(
					x,
					top + 3 + note * pitch,
					0.52 * u,
					Math.max(1, pitch - 1),
				);
		});

		if (turned <= 0) return;

		ctx.globalAlpha = 1;

		if (sheet.shared) {
			ctx.fillRect(SHELF.x * u, top - 1, SHELF.wide * u * clamp(turned * 6), 2);

			return;
		}

		ctx.fillStyle = open ? this.ink.red : this.ink.yellow;

		this.stacks.forEach((count, col) => {
			if (!count) return;

			const x = (HALL.x + col + 0.09) * u;

			ctx.fillRect(x, top + tall - 2, 0.82 * u * turned, 2);

			if (open) ctx.fillRect(x + 0.26 * u, top + tall, 0.3 * u, 0.9 * u);
		});
	}

	private render() {
		const { ctx, u, ink, dpr, sheet, verdict, spans, ms } = this;

		if (!ctx || !u) return;

		const clock = clockAt(spans, ms);
		const leaving =
			verdict.stuck > 0 && verdict.spare > 0 && plan(sheet) === "leave";
		const reach = leaving ? progress(spans, "reach", ms) : 0;
		const halt = progress(spans, "halt", ms);
		const working = leaving && verdict.habit !== "stopped";
		const turned = working
			? clamp((hands(sheet) * Math.max(0, clock - EVERY)) / OPENS)
			: 0;
		const open = verdict.opens > 0 && clock >= verdict.opens;
		const grown = clamp((ms - startOf(spans, "roam")) / LINK_MS);
		const watching = this.watched();

		this.count(clock);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		clear(ctx, u);
		walls(ctx, u, ink, sheet.shared && open ? 1 : 0);
		tag(ctx, u, ink, `${ROOMS} ROOMS`, HALL.x, 0.85, "left");
		tag(
			ctx,
			u,
			ink,
			`TRY ${plain(clock)} OF ${plain(sheet.budget)}`,
			HALL.x + HALL.cols,
			0.85,
			"right",
		);
		tag(ctx, u, ink, "SHELF", SHELF.x, 30.6, "left");
		tag(ctx, u, ink, "BACK DOOR", LOCK.x + LOCK.side, 30.6, "right");
		tag(ctx, u, ink, "ANSWERS?", BLOCK.x, BLOCK.y - 0.8, "left");

		for (let room = 0; room < ROOMS; room++) {
			const [col, row] = seat(room);

			board(
				ctx,
				dpr,
				(HALL.x + col) * u,
				(HALL.y + row) * u,
				u,
				this.show(room),
			);
		}

		if (reach > 0) this.threads(ctx, reach, 1 - 0.6 * halt);

		const [col, row] = seat(watching);

		ctx.globalAlpha = 1;
		ctx.strokeStyle = ink.paper;
		ctx.lineWidth = 1.5;
		ctx.strokeRect(
			(HALL.x + col) * u + 0.25,
			(HALL.y + row) * u + 0.25,
			u - 0.5,
			u - 0.5,
		);
		closeup(ctx, dpr, u, ink, this.show(watching), `ROOM ${watching + 1}`);
		shelf(ctx, u, ink, sheet.shared);

		if (reach > 0.8)
			this.notes(
				ctx,
				clamp((reach - 0.8) / 0.2) * (1 - 0.6 * halt),
				turned,
				open,
			);

		lock(
			ctx,
			u,
			ink,
			sheet.shared ? turned : 0,
			sheet.shared && open,
			sheet.guard.fact,
			Math.sin(Math.PI * halt),
		);
		block(ctx, u, ink, forced(sheet, verdict.opens, clock));
		link(ctx, u, ink, sheet.shared && open ? grown : 0);
		ctx.globalAlpha = 1;
		this.stale = false;
	}
}
