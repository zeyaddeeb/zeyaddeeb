import { CELLS, COLS, sailable } from "./chart";
import { POINTING, SILENT, SLOTS, survey } from "./field";
import type { Solver } from "./solver";

const SWING_MS = 110;
const SPARK_MS = 180;
const TURN = Math.PI * 2;

const arc = (from: number, to: number) => {
	const d = (to - from) % TURN;

	return d > Math.PI ? d - TURN : d < -Math.PI ? d + TURN : d;
};

export class Needles {
	private read = new Float32Array(CELLS * SLOTS);
	private angle = new Float32Array(CELLS);
	private goal = new Float32Array(CELLS);
	private size = new Float32Array(CELLS);
	private grow = new Float32Array(CELLS);
	private glow = new Float32Array(CELLS);
	private shine = new Float32Array(CELLS);
	private shown = new Uint8Array(CELLS);
	private heard = new Uint8Array(CELLS).fill(1);
	private spark = new Float32Array(CELLS);

	hush() {
		this.heard.fill(0);
	}

	retarget(solver: Solver, clock: number, hold: boolean) {
		const { read } = this;
		let low = Infinity;
		let high = -Infinity;

		survey(solver, clock, read);

		for (let cell = 0; cell < CELLS; cell++) {
			this.shown[cell] = sailable(solver.sea, cell) ? 1 : 0;

			if (!this.shown[cell]) continue;

			const value = read[cell * SLOTS + 3] ?? 0;

			low = Math.min(low, value);
			high = Math.max(high, value);
		}

		const span = high - low;

		for (let cell = 0; cell < CELLS; cell++) {
			if (!this.shown[cell]) continue;

			const at = cell * SLOTS;
			const state = read[at + 2];

			if (state === SILENT && hold) continue;

			if (!this.heard[cell]) {
				this.heard[cell] = 1;
				this.spark[cell] = hold ? 1 : 0;
			}

			this.shine[cell] =
				span > 1e-9 ? ((read[at + 3] ?? 0) - low) / span : 0.35;
			this.grow[cell] = state === POINTING ? 1 : 0;

			if (state === POINTING)
				this.goal[cell] = Math.atan2(read[at + 1] ?? 0, read[at] ?? 0);
		}
	}

	advance(ms: number) {
		const k = 1 - Math.exp(-ms / SWING_MS);
		const fade = Math.exp(-ms / SPARK_MS);

		for (let cell = 0; cell < CELLS; cell++) {
			const size = this.size[cell] ?? 0;
			const angle = this.angle[cell] ?? 0;
			const goal = this.goal[cell] ?? 0;

			this.angle[cell] = size < 0.05 ? goal : angle + arc(angle, goal) * k;
			this.spark[cell] = (this.spark[cell] ?? 0) * fade;
			this.size[cell] = size + ((this.grow[cell] ?? 0) - size) * k;
			this.glow[cell] =
				(this.glow[cell] ?? 0) +
				((this.shine[cell] ?? 0) - (this.glow[cell] ?? 0)) * k;
		}
	}

	settle() {
		this.angle.set(this.goal);
		this.size.set(this.grow);
		this.glow.set(this.shine);
		this.spark.fill(0);
		this.heard.fill(1);
	}

	draw(
		ctx: CanvasRenderingContext2D,
		u: number,
		color: string,
		skip: number,
		fade: number,
	) {
		const length = 0.54 * u;
		const half = Math.max(1, 0.06 * u);
		const dot = Math.max(1, 0.045 * u);

		ctx.fillStyle = color;

		for (let cell = 0; cell < CELLS; cell++) {
			if (!this.shown[cell] || cell === skip) continue;

			const x = ((cell % COLS) + 0.5) * u;
			const y = (Math.floor(cell / COLS) + 0.5) * u;
			const size = this.size[cell] ?? 0;
			const glow = this.glow[cell] ?? 0;

			ctx.globalAlpha = Math.min(
				1,
				fade * (0.14 + 0.56 * glow * glow + 0.6 * (this.spark[cell] ?? 0)),
			);
			ctx.beginPath();

			if (size < 0.06) {
				ctx.arc(x, y, dot, 0, TURN);
			} else {
				const a = this.angle[cell] ?? 0;
				const cos = Math.cos(a);
				const sin = Math.sin(a);
				const reach = (length * size) / 2;
				const wide = half * (0.6 + 0.4 * size);

				ctx.moveTo(x + cos * reach, y + sin * reach);
				ctx.lineTo(x - cos * reach - sin * wide, y - sin * reach + cos * wide);
				ctx.lineTo(x - cos * reach + sin * wide, y - sin * reach - cos * wide);
				ctx.closePath();
			}

			ctx.fill();
		}

		ctx.globalAlpha = 1;
	}
}
