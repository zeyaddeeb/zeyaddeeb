import { sailable } from "./chart";
import type { Rule } from "./rule";
import { keep, recall, Solver, solve } from "./solver";
import {
	advance,
	after,
	type Boat,
	course,
	type End,
	type Leg,
	launch,
	type Pick,
	sail,
	steer,
	type Verdict,
	verdict,
} from "./voyage";

export const STEP_MS = 240;
export const HOLD_MS = 900;

const SWEEP_MS = 16;
const WAVE = 32;
const AHEAD = 12;

export interface Tally {
	points: number;
	races: number;
}

export type Phase = "wave" | "settle" | "exact";

export type Event =
	| { kind: "strike"; buoy: number }
	| { kind: "nudge" }
	| { kind: "end"; end: End }
	| { kind: "launch" };

export interface Listener {
	tally: (tally: Tally) => void;
	solving: () => void;
	settled: (verdict: Verdict, rule: Rule) => void;
}

export class Run {
	solver: Solver;
	phase: Phase = "exact";
	boat: Boat = launch();
	leg: Leg | null = null;
	last: Leg | null = null;
	progress = 0;
	hold = 0;
	tally: Tally = { points: 0, races: 0 };
	thread: number[] = [];
	events: Event[] = [];
	stale = true;
	private helm: Solver;
	private sweeps = 0;
	private debt = 0;
	private listener: Listener;

	constructor(rule: Rule, listener: Listener) {
		this.solver = solve(rule);
		this.helm = this.solver;
		this.listener = listener;
		listener.settled(verdict(this.solver), this.solver.rule);
	}

	readonly pick: Pick = (boat) =>
		steer(this.phase === "exact" ? this.solver : this.helm, boat);

	change(rule: Rule, animate: boolean) {
		this.helm = this.phase === "exact" ? this.solver : this.helm;
		this.tally = { points: 0, races: 0 };
		this.listener.tally(this.tally);

		if (animate) {
			this.solver = new Solver(rule);
			this.phase = "wave";
			this.sweeps = 0;
			this.debt = 0;
			this.listener.solving();
		} else {
			this.solver = solve(rule);
			this.finish();
		}

		this.rebase();
		this.stale = true;
	}

	drop(cell: number) {
		if (!sailable(this.solver.sea, cell)) return false;

		this.place({ ...this.boat, cell });

		return true;
	}

	tick(ms: number) {
		this.think(ms);

		if (this.hold > 0) {
			this.hold -= ms;

			if (this.hold <= 0) this.place(launch());

			return;
		}

		if (!this.leg) this.depart();

		this.progress += ms / STEP_MS;

		while (this.progress >= 1 && this.leg) {
			this.progress -= 1;
			this.arrive(this.leg);

			if (this.hold > 0) this.progress = 0;
			else this.depart();
		}
	}

	outlook(cell: number) {
		if (this.phase !== "exact" || !sailable(this.solver.sea, cell)) return null;

		return verdict(this.solver, { ...launch(cell), clock: this.boat.clock });
	}

	route(cell: number, limit: number) {
		if (!sailable(this.solver.sea, cell)) return [];

		const start = { ...launch(cell), clock: this.boat.clock };

		return [
			cell,
			...course(this.solver, start, limit, this.pick).map((leg) => leg.to),
		];
	}

	private think(ms: number) {
		if (this.phase === "wave") this.spread(ms);
		else if (this.phase === "settle" && this.solver.round() === 0)
			this.finish();
	}

	private spread(ms: number) {
		this.debt = Math.min(this.debt + ms, 2 * SWEEP_MS);

		while (this.debt >= SWEEP_MS && this.phase === "wave") {
			this.debt -= SWEEP_MS;
			this.sweeps++;
			this.stale = true;

			if (this.solver.sweep() > 0 && this.sweeps < WAVE) continue;

			const known = recall(this.solver.rule);

			if (known) {
				this.solver = known;
				this.finish();
			} else {
				this.solver.begin();
				this.phase = "settle";
			}
		}

		this.chart();
	}

	private finish() {
		this.phase = "exact";
		this.helm = this.solver;
		this.stale = true;
		keep(this.solver);
		this.chart();
		this.listener.settled(verdict(this.solver), this.solver.rule);
	}

	private rebase() {
		const adrift = !sailable(this.solver.sea, this.boat.cell);
		const again = this.leg
			? advance(this.solver, this.boat, this.leg.action)
			: null;

		if (adrift || (this.leg && again?.to !== this.leg.to)) {
			this.place(launch());

			return;
		}

		if (this.leg && again) this.leg = { ...this.leg, ...again };

		this.chart();
	}

	private place(boat: Boat) {
		this.boat = boat;
		this.leg = null;
		this.last = null;
		this.progress = 0;
		this.hold = 0;
		this.thread = [];
		this.events.push({ kind: "launch" });
		this.stale = true;
	}

	private depart() {
		this.leg = sail(this.solver, this.boat, this.pick);
		this.chart();
	}

	private chart() {
		const { leg } = this;

		if (!leg || leg.end) {
			this.thread = leg ? [leg.to] : [];

			return;
		}

		this.thread = [
			leg.to,
			...course(this.solver, after(leg), AHEAD, this.pick).map((l) => l.to),
		];
	}

	private arrive(leg: Leg) {
		this.tally = {
			points: this.tally.points + leg.pay,
			races: this.tally.races + (leg.end === "finish" ? 1 : 0),
		};
		this.boat = after(leg);
		this.last = leg;
		this.stale = true;

		if (leg.struck >= 0) this.events.push({ kind: "strike", buoy: leg.struck });
		if (leg.nudged) this.events.push({ kind: "nudge" });

		if (leg.end) {
			this.events.push({ kind: "end", end: leg.end });
			this.hold = HOLD_MS;
			this.leg = null;
		}

		this.listener.tally(this.tally);
	}
}
