import {
	buoyAt,
	DOCK,
	EAST,
	kinds,
	MOVES,
	STAY,
	STRUCK,
	TICK,
	UP,
} from "./chart";
import { BUOY_PAY } from "./rule";
import { fixedPay, type Solver } from "./solver";

const LIMIT = 2400;

export interface Boat {
	cell: number;
	clock: number;
	heading: number;
}

export type End = "finish" | "crash";

export interface Leg {
	from: number;
	to: number;
	action: number;
	heading: number;
	astern: boolean;
	pay: number;
	struck: number;
	nudged: boolean;
	end: End | null;
	clock: number;
}

export type Habit = "finish" | "farm" | "dock" | "crash" | "dither" | "tamper";

export interface Verdict {
	habit: Habit;
	seconds: number;
	paid: number;
	rate: number;
}

export const launch = (cell = DOCK): Boat => ({
	cell,
	clock: 0,
	heading: EAST,
});

const turn = (a: number, b: number) => {
	const d = Math.abs(a - b) % 8;

	return Math.min(d, 8 - d);
};

function drift(actions: number[]) {
	let x = 0;
	let y = 0;

	for (const action of actions) {
		const [dx, dy] = MOVES[action] ?? [0, 0];
		const reach = Math.hypot(dx, dy) || 1;

		x += dx / reach;
		y += dy / reach;
	}

	return Math.hypot(x, y) < 1e-6 ? null : Math.atan2(y, x);
}

function off(action: number, bearing: number | null) {
	if (bearing === null) return 0;

	const [dx, dy] = MOVES[action] ?? [0, 0];
	const gap = Math.abs(Math.atan2(dy, dx) - bearing) % (2 * Math.PI);

	return Math.round(Math.min(gap, 2 * Math.PI - gap) * 1000);
}

export function steer(solver: Solver, boat: Boat) {
	const { actions, still } = solver.best(boat.cell, boat.clock);

	if (still) return STAY;

	const bearing = drift(actions);
	const rank = (action: number) => {
		const t = turn(action, boat.heading);

		return off(action, bearing) * 10 + (t === 4 ? 0.5 : t);
	};

	return actions.reduce((pick, action) =>
		rank(action) < rank(pick) ? action : pick,
	);
}

export function advance(solver: Solver, boat: Boat, action: number) {
	const { sea, rule } = solver;
	const k = boat.cell * MOVES.length + action;
	const to = sea.to[k] ?? boat.cell;
	const ticked = TICK[boat.clock] ?? 0;
	const buoy = buoyAt[to] ?? -1;
	const struck = buoy >= 0 && UP[buoy]?.[ticked] === 1 ? buoy : -1;
	const kind = kinds[to];

	return {
		to,
		struck,
		nudged: sea.nudge[k] === 1,
		clock: struck < 0 ? ticked : (STRUCK[struck]?.[ticked] ?? ticked),
		pay:
			fixedPay(rule, sea, boat.cell, action) +
			(struck >= 0 && rule.buoy ? BUOY_PAY : 0),
		end: kind === "finish" ? "finish" : kind === "rock" ? "crash" : null,
	} as const;
}

export type Pick = (boat: Boat) => number;

export const helm =
	(solver: Solver): Pick =>
	(boat) =>
		steer(solver, boat);

export function sail(solver: Solver, boat: Boat, pick = helm(solver)): Leg {
	const action = pick(boat);
	const step = advance(solver, boat, action);
	const about = action !== STAY && turn(action, boat.heading) === 4;
	const astern =
		about &&
		!step.end &&
		pick({ ...boat, cell: step.to, clock: step.clock }) === boat.heading;

	return {
		...step,
		from: boat.cell,
		action,
		astern,
		heading: action === STAY || astern ? boat.heading : action,
	};
}

export const after = (leg: Leg): Boat => ({
	cell: leg.to,
	clock: leg.clock,
	heading: leg.heading,
});

export function course(
	solver: Solver,
	start: Boat,
	limit: number,
	pick = helm(solver),
) {
	const legs: Leg[] = [];
	let boat = start;

	while (legs.length < limit) {
		const leg = sail(solver, boat, pick);

		legs.push(leg);

		if (leg.end) break;

		boat = after(leg);
	}

	return legs;
}

function habitOf(solver: Solver, loop: Leg[]): Habit {
	if (loop.some((leg) => leg.nudged)) return "tamper";
	if (solver.rule.buoy && loop.some((leg) => leg.struck >= 0)) return "farm";
	if (loop.every((leg) => leg.action === STAY)) return "dock";

	return "dither";
}

export function verdict(solver: Solver, start: Boat = launch()): Verdict {
	const seen = new Map<string, number>();
	const legs: Leg[] = [];
	let boat = start;
	let paid = 0;

	while (legs.length < LIMIT) {
		const key = `${boat.cell}:${boat.clock}:${boat.heading}`;
		const since = seen.get(key);

		if (since !== undefined) {
			const loop = legs.slice(since);
			const earned = loop.reduce((sum, leg) => sum + leg.pay, 0);

			return {
				habit: habitOf(solver, loop),
				seconds: since,
				paid,
				rate: earned / loop.length,
			};
		}

		seen.set(key, legs.length);

		const leg = sail(solver, boat);

		legs.push(leg);
		paid += leg.pay;

		if (leg.end)
			return {
				habit: leg.end === "finish" ? "finish" : "crash",
				seconds: legs.length,
				paid,
				rate: 0,
			};

		boat = after(leg);
	}

	return { habit: "dither", seconds: LIMIT, paid, rate: 0 };
}
