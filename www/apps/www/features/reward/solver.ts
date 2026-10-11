import {
	buoyAt,
	CELLS,
	CLOCKS,
	ends,
	kinds,
	MOVES,
	STAY,
	STRUCK,
	sailable,
	TICK,
	UP,
	type Waters,
	waters,
} from "./chart";
import {
	BUOY_PAY,
	CRASH_COST,
	GAMMA,
	keyOf,
	NUDGE_PAY,
	PROGRESS_PAY,
	type Rule,
	TIME_COST,
} from "./rule";

const ACTIONS = MOVES.length;
const EDGE = 1e-9;
const TIE = 1e-7;

export function closer(sea: Waters, from: number, to: number) {
	const before = sea.away[from] ?? -1;
	const after = sea.away[to] ?? -1;

	return before >= 0 && after >= 0 && after < before;
}

export function fixedPay(
	rule: Rule,
	sea: Waters,
	cell: number,
	action: number,
) {
	const k = cell * ACTIONS + action;
	const to = sea.to[k] ?? cell;
	const kind = kinds[to];

	return (
		(rule.time ? -TIME_COST : 0) +
		(rule.progress && closer(sea, cell, to) ? PROGRESS_PAY : 0) +
		(rule.crash && kind === "rock" ? -CRASH_COST : 0) +
		(kind === "finish" ? rule.finish : 0) +
		(sea.nudge[k] ? NUDGE_PAY : 0)
	);
}

export interface Best {
	value: number;
	actions: number[];
	still: boolean;
}

interface Bench {
	spare: Float64Array;
	succ: Int32Array;
	pay: Float64Array;
	mark: Uint8Array;
	stack: Int32Array;
}

const benches = new Map<number, Bench>();

function bench(size: number) {
	const found = benches.get(size);

	if (found) return found;

	const made = {
		spare: new Float64Array(size),
		succ: new Int32Array(size),
		pay: new Float64Array(size),
		mark: new Uint8Array(size),
		stack: new Int32Array(size),
	};

	benches.set(size, made);

	return made;
}

export class Solver {
	readonly rule: Rule;
	readonly sea: Waters;
	readonly clocks: number;
	readonly size: number;
	value: Float64Array;
	private gain: Float64Array;
	private live: Uint8Array;

	constructor(rule: Rule) {
		this.rule = rule;
		this.sea = waters(rule.reach);
		this.clocks = rule.buoy ? CLOCKS : 1;
		this.size = CELLS * this.clocks;
		this.value = new Float64Array(this.size);
		this.gain = new Float64Array(CELLS * ACTIONS);
		this.live = new Uint8Array(CELLS);

		for (let cell = 0; cell < CELLS; cell++) {
			this.live[cell] = sailable(this.sea, cell) ? 1 : 0;

			for (let action = 0; action < ACTIONS; action++)
				this.gain[cell * ACTIONS + action] = fixedPay(
					rule,
					this.sea,
					cell,
					action,
				);
		}
	}

	index(cell: number, clock: number) {
		return this.clocks === 1 ? cell : cell * CLOCKS + clock;
	}

	q(cell: number, clock: number, action: number) {
		const k = cell * ACTIONS + action;
		const to = this.sea.to[k] ?? cell;
		const pay = this.gain[k] ?? 0;

		if (ends(to)) return pay;
		if (this.clocks === 1) return pay + GAMMA * (this.value[to] ?? 0);

		const ticked = TICK[clock] ?? 0;
		const buoy = buoyAt[to] ?? -1;

		if (buoy < 0 || !UP[buoy]?.[ticked])
			return pay + GAMMA * (this.value[to * CLOCKS + ticked] ?? 0);

		const after = STRUCK[buoy]?.[ticked] ?? ticked;

		return pay + BUOY_PAY + GAMMA * (this.value[to * CLOCKS + after] ?? 0);
	}

	best(cell: number, clock: number): Best {
		const base = this.clocks === 1 ? 0 : clock;
		const qs = MOVES.map((_, action) => this.q(cell, base, action));
		const value = Math.max(...qs);
		const edge = TIE * Math.max(1, Math.abs(value));
		const actions = qs.flatMap((q, action) =>
			value - q <= edge ? [action] : [],
		);

		const moves = actions.filter((action) => action !== STAY);
		const idle = moves.length === 0 || actions.length === ACTIONS;

		return { value, actions: idle ? actions : moves, still: idle };
	}

	sweep() {
		const desk = bench(this.size);
		const { spare } = desk;
		let delta = 0;

		for (let cell = 0; cell < CELLS; cell++) {
			if (!this.live[cell]) continue;

			for (let clock = 0; clock < this.clocks; clock++) {
				const s = cell * this.clocks + clock;
				let top = -Infinity;

				for (let action = 0; action < ACTIONS; action++) {
					const q = this.q(cell, clock, action);

					if (q > top) top = q;
				}

				delta = Math.max(delta, Math.abs(top - (this.value[s] ?? 0)));
				spare[s] = top;
			}
		}

		desk.spare = this.value;
		this.value = spare;

		return delta;
	}

	begin() {
		this.follow(STAY);
	}

	round() {
		this.evaluate();

		return this.improve();
	}

	settle(limit = 400) {
		this.begin();

		for (let round = 1; round <= limit; round++)
			if (this.round() === 0) return round;

		return limit;
	}

	private follow(fallback: number) {
		for (let cell = 0; cell < CELLS; cell++) {
			if (!this.live[cell]) continue;

			for (let clock = 0; clock < this.clocks; clock++) {
				const s = cell * this.clocks + clock;
				let top = this.q(cell, clock, fallback);
				let pick = fallback;

				for (let action = 0; action < ACTIONS; action++) {
					const q = this.q(cell, clock, action);

					if (q > top + EDGE) {
						top = q;
						pick = action;
					}
				}

				this.take(s, cell, clock, pick);
			}
		}
	}

	private take(s: number, cell: number, clock: number, action: number) {
		const k = cell * ACTIONS + action;
		const to = this.sea.to[k] ?? cell;
		let pay = this.gain[k] ?? 0;
		let next = ends(to) ? -1 : to;

		if (next >= 0 && this.clocks > 1) {
			const ticked = TICK[clock] ?? 0;
			const buoy = buoyAt[to] ?? -1;
			const hit = buoy >= 0 && UP[buoy]?.[ticked] === 1;

			if (hit) pay += BUOY_PAY;

			next = to * CLOCKS + (hit ? (STRUCK[buoy]?.[ticked] ?? ticked) : ticked);
		}

		const desk = bench(this.size);

		desk.succ[s] = next;
		desk.pay[s] = pay;
	}

	private evaluate() {
		const { mark, stack, succ, pay } = bench(this.size);
		const { value } = this;

		mark.fill(0);

		for (let cell = 0; cell < CELLS; cell++) {
			if (!this.live[cell]) continue;

			for (let clock = 0; clock < this.clocks; clock++) {
				let s = cell * this.clocks + clock;

				if (mark[s]) continue;

				let depth = 0;

				while (s >= 0 && !mark[s]) {
					mark[s] = 1;
					stack[depth++] = s;
					s = succ[s] ?? -1;
				}

				if (s >= 0 && mark[s] === 1) depth = this.close(s, depth);

				for (let i = depth - 1; i >= 0; i--) {
					const u = stack[i] ?? 0;
					const v = succ[u] ?? -1;

					value[u] = (pay[u] ?? 0) + (v < 0 ? 0 : GAMMA * (value[v] ?? 0));
					mark[u] = 2;
				}
			}
		}
	}

	private close(entry: number, depth: number) {
		const { mark, stack, succ, pay } = bench(this.size);
		const { value } = this;
		let start = depth - 1;

		while (stack[start] !== entry) start--;

		let total = 0;
		let weight = 1;

		for (let i = start; i < depth; i++) {
			total += weight * (pay[stack[i] ?? 0] ?? 0);
			weight *= GAMMA;
		}

		value[entry] = total / (1 - weight);
		mark[entry] = 2;

		for (let i = depth - 1; i > start; i--) {
			const u = stack[i] ?? 0;

			value[u] = (pay[u] ?? 0) + GAMMA * (value[succ[u] ?? 0] ?? 0);
			mark[u] = 2;
		}

		return start;
	}

	private improve() {
		let changed = 0;

		for (let cell = 0; cell < CELLS; cell++) {
			if (!this.live[cell]) continue;

			for (let clock = 0; clock < this.clocks; clock++) {
				const s = cell * this.clocks + clock;
				const held = this.value[s] ?? 0;
				const edge = EDGE * Math.max(1, Math.abs(held));
				let top = held;
				let pick = -1;

				for (let action = 0; action < ACTIONS; action++) {
					const q = this.q(cell, clock, action);

					if (q > top + edge) {
						top = q;
						pick = action;
					}
				}

				if (pick < 0) continue;

				this.take(s, cell, clock, pick);
				changed++;
			}
		}

		return changed;
	}
}

const KEPT = 24;
const solved = new Map<string, Solver>();

export const recall = (rule: Rule) => solved.get(keyOf(rule)) ?? null;

export function keep(solver: Solver) {
	const key = keyOf(solver.rule);

	solved.delete(key);
	solved.set(key, solver);

	for (const old of solved.keys()) {
		if (solved.size <= KEPT) break;

		solved.delete(old);
	}

	return solver;
}

export function solve(rule: Rule) {
	const found = recall(rule);

	if (found) return found;

	const solver = new Solver(rule);

	solver.settle();

	return keep(solver);
}
