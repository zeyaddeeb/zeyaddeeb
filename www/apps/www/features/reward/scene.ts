import { fitCanvas } from "@/lib/canvas";
import { BUOYS, COLS, DOCK, MOVES, RESPAWN, ROWS, timer } from "./chart";
import { Needles } from "./needles";
import {
	chartLayer,
	boat as drawBoat,
	buoys as drawBuoys,
	gate,
	type Ink,
	inkOf,
	mid,
	type Point,
	ping,
	strand,
	tower,
	wall,
} from "./paint";
import { NOTHING, type Rule } from "./rule";
import { HOLD_MS, type Listener, Run } from "./run";
import { solve } from "./solver";
import { fromHere, plain } from "./story";
import { course, launch } from "./voyage";

const GLIDE_MS = 70;
const TURN_MS = 90;
const FADE_MS = 120;
const WALL_MS = 160;
const WAKE_MS = 9000;
const WAKE_MAX = 900;
const PING_MS = 380;
const FLASH_MS = 420;
const BUMP_MS = 200;
const PREVIEW = 40;
const SHADES = 6;

interface Trace extends Point {
	born: number;
	gap: boolean;
}

const ease = (ms: number, over: number) => 1 - Math.exp(-ms / over);

const bearing = (action: number) => {
	const [dx, dy] = MOVES[action] ?? [1, 0];

	return Math.atan2(dy, dx);
};

const arc = (from: number, to: number) => {
	const d = (to - from) % (Math.PI * 2);

	return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d;
};

const race = () => [
	DOCK,
	...course(solve({ ...NOTHING, finish: 100 }), launch(), PREVIEW).map(
		(leg) => leg.to,
	),
];

export class Scene {
	readonly run: Run;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D | null;
	private layer: HTMLCanvasElement;
	private ink: Ink;
	private needles = new Needles();
	private u = 0;
	private dpr = 1;
	private now = 0;
	private at: Point = mid(DOCK, 1);
	private angle = 0;
	private alpha = 1;
	private fence = 1;
	private wake: Trace[] = [];
	private pings: { buoy: number; born: number }[] = [];
	private flash = -Infinity;
	private bump = -Infinity;
	private cut = true;
	private pointer = -1;
	private preview: number[] = [];
	private spot: (text: string | null) => void;

	constructor(
		canvas: HTMLCanvasElement,
		rule: Rule,
		listener: Listener,
		spot: (text: string | null) => void,
	) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.layer = document.createElement("canvas");
		this.ink = inkOf(canvas);
		this.spot = spot;
		this.run = new Run(rule, listener);
		this.fence = rule.reach ? 0 : 1;
		this.aim(false);
		this.needles.settle();
	}

	resize(width: number) {
		if (!this.ctx || !width) return;

		const height = (width * ROWS) / COLS;
		const paper = this.layer.getContext("2d");

		this.u = width / COLS;
		this.dpr = fitCanvas(this.canvas, width, height);
		this.layer.width = this.canvas.width;
		this.layer.height = this.canvas.height;
		this.ink = inkOf(this.canvas);

		if (paper) {
			paper.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
			chartLayer(paper, this.u, this.ink, race());
		}

		this.render();
	}

	change(rule: Rule, animate: boolean) {
		this.run.change(rule, animate);

		if (this.pointer < 0) this.spot(null);

		if (animate) {
			this.needles.hush();

			return;
		}

		this.fence = rule.reach ? 0 : 1;
		this.rest();
	}

	frame(ms: number) {
		this.now += ms;
		this.run.tick(ms);
		this.absorb();

		if (this.run.stale) {
			this.aim(this.run.phase === "wave");
			this.run.stale = false;
		}

		this.glide(ms);
		this.needles.advance(ms);
		this.render();
	}

	rest() {
		this.absorb();
		this.aim(false);
		this.needles.settle();
		this.at = mid(this.run.boat.cell, 1);
		this.alpha = 1;
		this.wake = [];
		this.cut = false;
		this.preview = this.run.route(this.run.boat.cell, PREVIEW);
		this.render();
	}

	drop(x: number, y: number) {
		const cell = this.cellAt(x, y);

		if (cell < 0 || !this.run.drop(cell)) return false;

		const outlook = this.run.outlook(cell);

		this.spot(outlook ? fromHere(outlook) : null);

		return true;
	}

	hover(x: number, y: number) {
		const cell = this.cellAt(x, y);

		if (cell !== this.pointer) this.watch(cell);
	}

	leave() {
		this.watch(-1);
	}

	private watch(cell: number) {
		this.pointer = cell;
		this.preview = cell < 0 ? [] : this.run.route(cell, PREVIEW);

		if (this.preview.length === 0) {
			this.spot(null);

			return;
		}

		const outlook = this.run.outlook(cell);

		if (outlook) this.spot(fromHere(outlook));
	}

	private cellAt(x: number, y: number) {
		const col = Math.floor(x / this.u);
		const row = Math.floor(y / this.u);

		return col < 0 || row < 0 || col >= COLS || row >= ROWS
			? -1
			: row * COLS + col;
	}

	private aim(hold: boolean) {
		this.needles.retarget(this.run.solver, this.run.boat.clock, hold);

		if (this.pointer >= 0) this.watch(this.pointer);
	}

	private absorb() {
		for (const event of this.run.events) {
			if (event.kind === "strike")
				this.pings.push({ buoy: event.buoy, born: this.now });
			else if (event.kind === "nudge") this.bump = this.now;
			else if (event.kind === "end" && event.end === "finish")
				this.flash = this.now;
			else if (event.kind === "launch") this.cut = true;
		}

		this.run.events.length = 0;
		this.pings = this.pings.filter((p) => this.now - p.born < PING_MS);
	}

	private goal(): { at: Point; heading: number | null; shown: number } {
		const { leg, last, hold, progress, boat } = this.run;

		if (leg) {
			const from = mid(leg.from, 1);
			const to = mid(leg.to, 1);
			const [dx, dy] = MOVES[leg.action] ?? [0, 0];
			const push = leg.nudged ? 0.32 * Math.sin(Math.PI * progress) : 0;

			return {
				at: {
					x: from.x + (to.x - from.x) * progress + dx * push,
					y: from.y + (to.y - from.y) * progress + dy * push,
				},
				heading: bearing(leg.heading),
				shown: 1,
			};
		}

		if (!last || hold <= 0)
			return { at: mid(boat.cell, 1), heading: null, shown: 1 };

		const since = HOLD_MS - hold;
		const drift = last.end === "finish" ? 0.8 * Math.min(1, since / 400) : 0;
		const way = bearing(last.heading);
		const end = mid(last.to, 1);

		return {
			at: {
				x: end.x + Math.cos(way) * drift,
				y: end.y + Math.sin(way) * drift,
			},
			heading: last.end === "crash" ? way + 0.9 : way,
			shown: since > 120 ? 0 : 1,
		};
	}

	private glide(ms: number) {
		const goal = this.goal();

		if (this.cut) {
			this.at = goal.at;
			this.alpha = 0;
			this.cut = false;
			this.wake.push({ ...goal.at, born: this.now, gap: true });
		}

		const k = ease(ms, GLIDE_MS);

		this.at = {
			x: this.at.x + (goal.at.x - this.at.x) * k,
			y: this.at.y + (goal.at.y - this.at.y) * k,
		};
		this.alpha += (goal.shown - this.alpha) * ease(ms, FADE_MS);
		this.fence +=
			((this.run.solver.rule.reach ? 0 : 1) - this.fence) * ease(ms, WALL_MS);

		if (goal.heading !== null)
			this.angle += arc(this.angle, goal.heading) * ease(ms, TURN_MS);

		this.trail();
	}

	private trail() {
		const tip = this.wake.at(-1);
		const moved = tip ? Math.hypot(tip.x - this.at.x, tip.y - this.at.y) : 1;

		if (moved > 0.04 && this.alpha > 0.5)
			this.wake.push({ ...this.at, born: this.now, gap: false });

		while (
			this.wake.length > WAKE_MAX ||
			this.now - (this.wake[0]?.born ?? this.now) > WAKE_MS
		)
			this.wake.shift();
	}

	private points(cells: number[], lead?: Point) {
		const points = lead ? [{ x: lead.x * this.u, y: lead.y * this.u }] : [];
		let before = -1;

		for (const cell of cells) {
			if (cell !== before) points.push(mid(cell, this.u));

			before = cell;
		}

		return points;
	}

	private groove(ctx: CanvasRenderingContext2D) {
		const { u, wake, now } = this;

		ctx.strokeStyle = this.ink.paper;
		ctx.lineWidth = Math.max(1, u * 0.035);
		ctx.lineCap = "round";

		for (let shade = 0; shade < SHADES; shade++) {
			ctx.beginPath();

			for (let i = 1; i < wake.length; i++) {
				const a = wake[i - 1];
				const b = wake[i];

				if (!a || !b || b.gap) continue;

				const young = 1 - (now - b.born) / WAKE_MS;

				if (Math.min(SHADES - 1, Math.floor(young * SHADES)) !== shade)
					continue;

				ctx.moveTo(a.x * u, a.y * u);
				ctx.lineTo(b.x * u, b.y * u);
			}

			ctx.globalAlpha = 0.3 * ((shade + 0.5) / SHADES) ** 2;
			ctx.stroke();
		}

		ctx.globalAlpha = 1;
	}

	private render() {
		const { ctx, u, ink, run } = this;

		if (!ctx || !u) return;

		const sailing = run.leg ? run.progress : 0;
		const down = BUOYS.map((_, i) =>
			Math.min(1, Math.max(0, timer(run.boat.clock, i) - sailing) / RESPAWN),
		);
		const under =
			this.alpha > 0.5
				? Math.floor(this.at.y) * COLS + Math.floor(this.at.x)
				: -1;

		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, COLS * u, ROWS * u);
		ctx.drawImage(this.layer, 0, 0, COLS * u, ROWS * u);
		wall(ctx, u, ink, this.fence);
		tower(
			ctx,
			u,
			ink,
			plain(run.tally.points),
			Math.max(0, 1 - (this.now - this.bump) / BUMP_MS),
		);
		gate(ctx, u, ink, Math.max(0, 1 - (this.now - this.flash) / FLASH_MS));
		this.needles.draw(ctx, u, ink.paper, under, 1);
		this.groove(ctx);

		ctx.lineCap = "butt";
		ctx.lineWidth = Math.max(1.25, u * 0.04);

		if (this.preview.length > 1) {
			ctx.strokeStyle = ink.paper;
			ctx.globalAlpha = 0.9;
			strand(ctx, this.points(this.preview), 1, 0.15);
		}

		ctx.strokeStyle = ink.yellow;
		ctx.lineWidth = Math.max(1.5, u * 0.05);
		ctx.globalAlpha = this.alpha;
		strand(ctx, this.points(run.thread, this.at), 0.95, 0);
		ctx.globalAlpha = 1;

		drawBuoys(ctx, u, ink, down);

		for (const p of this.pings)
			ping(ctx, u, ink, p.buoy, (this.now - p.born) / PING_MS);

		drawBoat(
			ctx,
			u,
			ink,
			{ x: this.at.x * u, y: this.at.y * u },
			this.angle,
			this.alpha,
		);
	}
}
