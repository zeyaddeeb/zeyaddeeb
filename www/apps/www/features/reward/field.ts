import { CELLS, MOVES, STAY, sailable } from "./chart";
import type { Solver } from "./solver";

export const SILENT = 0;
export const STILL = 1;
export const POINTING = 2;
export const SLOTS = 4;

const NEWS = 1e-9;
const TIE = 1e-7;
const qs = new Float64Array(MOVES.length);

export function aim(
	solver: Solver,
	cell: number,
	clock: number,
	out: Float32Array,
) {
	const at = cell * SLOTS;
	let top = -Infinity;
	let low = Infinity;

	for (let action = 0; action < MOVES.length; action++) {
		const q = solver.q(cell, clock, action);

		qs[action] = q;
		top = Math.max(top, q);
		low = Math.min(low, q);
	}

	out[at + 3] = top;

	if (top - low <= NEWS) {
		out[at + 2] = SILENT;

		return;
	}

	const edge = TIE * Math.max(1, Math.abs(top));
	let dx = 0;
	let dy = 0;
	let fx = 0;
	let fy = 0;

	for (let action = MOVES.length - 1; action > STAY; action--) {
		if (top - (qs[action] ?? 0) > edge) continue;

		const [mx, my] = MOVES[action] ?? [0, 0];
		const reach = Math.hypot(mx, my);

		fx = mx / reach;
		fy = my / reach;
		dx += fx;
		dy += fy;
	}

	if (fx === 0 && fy === 0) {
		out[at + 2] = STILL;

		return;
	}

	const pull = Math.hypot(dx, dy);

	out[at] = pull < 1e-6 ? fx : dx / pull;
	out[at + 1] = pull < 1e-6 ? fy : dy / pull;
	out[at + 2] = POINTING;
}

export function survey(solver: Solver, clock: number, out: Float32Array) {
	for (let cell = 0; cell < CELLS; cell++) {
		if (sailable(solver.sea, cell)) aim(solver, cell, clock, out);
		else out[cell * SLOTS + 2] = SILENT;
	}
}
