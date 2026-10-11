import { beforeAll, describe, expect, it } from "vitest";
import {
	at,
	BUOYS,
	CLOCKS,
	DOCK,
	EAST,
	kinds,
	STAY,
	sailable,
	waters,
} from "./chart";
import { aim, POINTING, SILENT, SLOTS } from "./field";
import { everyRule, GAMMA, keyOf, NOTHING, OPENING, type Rule } from "./rule";
import { Solver, solve } from "./solver";
import { CAPTIONS, caption, FIRST, onPaper, PLATES } from "./story";
import {
	course,
	type Habit,
	launch,
	sail,
	type Verdict,
	verdict,
} from "./voyage";

const rule = (parts: Partial<Rule>): Rule => ({ ...NOTHING, ...parts });
const habit = (parts: Partial<Rule>) => verdict(solve(rule(parts))).habit;
const verdicts = new Map<string, Verdict>();

beforeAll(() => {
	for (const r of everyRule()) verdicts.set(keyOf(r), verdict(solve(r)));
}, 60_000);

const judged = (r: Rule) => verdicts.get(keyOf(r)) ?? verdict(solve(r));

describe("voyage", () => {
	it("circles the lagoon on the opening rule and never finishes", () => {
		const v = verdict(solve(OPENING));
		const legs = course(solve(OPENING), launch(), 60);
		const lap = legs.slice(-6);

		expect(v).toMatchObject({ habit: "farm", rate: 5 });
		expect(legs.some((leg) => leg.end)).toBe(false);
		expect(new Set(lap.map((leg) => leg.struck)).size).toBe(4);
		expect(lap.filter((leg) => leg.struck >= 0)).toHaveLength(3);
	});

	it("keeps circling when a small prize is added", () => {
		expect(habit({ buoy: true, finish: 100 })).toBe("farm");
		expect(habit({ buoy: true, finish: 100, time: true })).toBe("farm");
	});

	it("leaves the lagoon for a prize worth a hundred buoys", () => {
		const v = verdict(solve(rule({ buoy: true, finish: 1000 })));

		expect(v).toMatchObject({ habit: "finish", seconds: 16, paid: 1000 });
	});

	it("finishes from close by but turns back from farther out", () => {
		const solver = solve(rule({ buoy: true, finish: 100 }));

		expect(verdict(solver, launch(at(15, 2))).habit).toBe("finish");
		expect(verdict(solver, launch(at(8, 6))).habit).toBe("farm");
		expect(verdict(solve(OPENING), launch(at(16, 2))).habit).toBe("farm");
	});

	it("races when only finishing pays", () => {
		const v = verdict(solve(rule({ finish: 100 })));

		expect(v).toMatchObject({ habit: "finish", seconds: 16, paid: 100 });
	});

	it("sinks itself when only the clock costs", () => {
		const v = verdict(solve(rule({ time: true })));

		expect(v).toMatchObject({ habit: "crash", seconds: 2, paid: -2 });
		expect(verdict(solve(rule({ time: true })), launch(at(14, 2))).habit).toBe(
			"finish",
		);
	});

	it("finishes with no prize once sinking costs more than the clock", () => {
		const v = verdict(solve(rule({ time: true, crash: true })));

		expect(v).toMatchObject({ habit: "finish", seconds: 16, paid: -16 });
	});

	it("never leaves the dock when the only clause is a penalty", () => {
		expect(habit({ crash: true })).toBe("dock");
		expect(habit({})).toBe("dock");
	});

	it("stops one move short of the line when progress pays", () => {
		const solver = solve(rule({ progress: true }));
		const legs = course(solver, launch(), 40);
		const tail = legs.slice(-8);

		expect(verdict(solver)).toMatchObject({ habit: "dither", rate: 0.5 });
		expect(legs.some((leg) => leg.end)).toBe(false);
		expect(new Set(tail.map((leg) => waters(false).away[leg.to]))).toEqual(
			new Set([1, 2]),
		);
		expect(tail.filter((leg) => leg.astern)).toHaveLength(4);
		expect(tail.every((leg) => leg.heading === EAST)).toBe(true);
	});

	it("leans on the scoreboard under every rule once it can reach it", () => {
		for (const r of everyRule().filter((r) => r.reach)) {
			const v = judged(r);

			expect(v.habit, keyOf(r)).toBe("tamper");
			expect(v.rate).toBeGreaterThanOrEqual(99);
		}
	});

	it("sorts every contract into one of six habits", () => {
		const tally: Partial<Record<Habit, number>> = {};

		for (const r of everyRule().filter((r) => !r.reach)) {
			const { habit } = judged(r);

			tally[habit] = (tally[habit] ?? 0) + 1;
		}

		expect(tally).toEqual({
			dock: 2,
			farm: 16,
			finish: 27,
			crash: 1,
			dither: 2,
		});
	});

	it("never sails onto land or through the wall", () => {
		for (const r of [OPENING, rule({ finish: 100 }), rule({ time: true })]) {
			for (const leg of course(solve(r), launch(), 80)) {
				expect(kinds[leg.to]).not.toBe("land");
				expect(kinds[leg.to]).not.toBe("wall");
				expect(kinds[leg.to]).not.toBe("tower");
			}
		}
	});

	it("faces the scoreboard and stays put while pushing", () => {
		const solver = solve(rule({ reach: true }));
		const legs = course(solver, launch(), 30);
		const last = legs.at(-1);

		expect(last?.nudged).toBe(true);
		expect(last?.to).toBe(last?.from);
		expect(last?.pay).toBe(100);
	});

	it("holds still at the dock under an empty rule", () => {
		const leg = sail(solve(NOTHING), launch());

		expect(leg.action).toBe(STAY);
		expect(leg.to).toBe(DOCK);
	});
});

describe("the numbers in the notes", () => {
	const sea = waters(false);
	const cells = kinds.flatMap((_, cell) => (sailable(sea, cell) ? [cell] : []));
	const worth = (parts: Partial<Rule>) =>
		Math.round(
			solve(rule(parts)).value[solve(rule(parts)).index(DOCK, 0)] ?? 0,
		);

	it("counts the cells and the situations", () => {
		expect(cells).toHaveLength(166);
		expect(cells.length * CLOCKS).toBe(35_856);
	});

	it("prices each offer from the dock", () => {
		expect(worth({ buoy: true })).toBe(79);
		expect(worth({ finish: 100 })).toBe(46);
		expect(worth({ finish: 1000 })).toBe(463);
		expect(Math.floor(79.362 / GAMMA ** 15)).toBe(171);
	});

	it("finishes from 62 cells when both clauses are on", () => {
		const solver = solve(rule({ buoy: true, finish: 100 }));
		const finishers = cells.filter(
			(cell) => verdict(solver, launch(cell)).habit === "finish",
		);

		expect(finishers).toHaveLength(62);
	});

	it("opens on the verdict the page is rendered with", () => {
		expect(verdict(solve(OPENING))).toEqual(FIRST);
	});

	it("reserves room for every caption a rule can produce", () => {
		for (const r of everyRule()) {
			const v = judged(r);

			expect(CAPTIONS, keyOf(r)).toContain(caption(r, v));
			expect(onPaper(v).length, keyOf(r)).toBeLessThan(30);
		}
	});

	it("shows every habit a plate promises", () => {
		for (const plate of PLATES)
			expect(verdict(solve(plate.rule)).habit).toBe(plate.habit);
	});
});

describe("field", () => {
	const read = (solver: Solver, cell: number, clock = 0) => {
		const out = new Float32Array(216 * SLOTS);

		aim(solver, cell, clock, out);

		return [...out.slice(cell * SLOTS, cell * SLOTS + 3)];
	};

	it("points every needle at the lagoon on the opening rule", () => {
		const [dx, dy, state] = read(solve(OPENING), at(8, 8));

		expect(state).toBe(POINTING);
		expect(dx).toBeLessThan(0);
		expect(dy).toBeLessThan(0);
	});

	it("has nothing to say where every move is worth the same", () => {
		const solver = solve(rule({ crash: true }));

		expect(read(solver, DOCK)[2]).toBe(SILENT);
	});

	it("leans away from rocks that cost something", () => {
		const [, dy, state] = read(solve(rule({ crash: true })), at(2, 10));

		expect(state).toBe(POINTING);
		expect(dy).toBeLessThan(0);
	});

	it("points at the scoreboard from beside it", () => {
		const solver = solve(rule({ reach: true }));
		const [dx, dy, state] = read(solver, at(13, 7));

		expect(solver.best(at(13, 7), 0).actions).toEqual([EAST]);
		expect([dx, dy, state]).toEqual([1, 0, POINTING]);
	});

	it("points back from the line when progress pays", () => {
		const [dx, , state] = read(solve(rule({ progress: true })), at(16, 2));

		expect(state).toBe(POINTING);
		expect(dx).toBeLessThan(0);
	});

	it("picks one way when two buoys pull equally", () => {
		const [dx, dy, state] = read(solve(OPENING), at(2, 1));

		expect(state).toBe(POINTING);
		expect(Math.hypot(dx ?? 0, dy ?? 0)).toBeCloseTo(1, 5);
	});

	it("turns away from a buoy that is still down", () => {
		const solver = solve(OPENING);
		const above = (BUOYS[0] ?? 0) - 18;
		const up = read(solver, above, 0);
		const down = read(solver, above, 5);

		expect(up[1]).toBeGreaterThan(0.9);
		expect(down[0]).toBeGreaterThan(0);
	});

	it("spreads news of a prize one cell per sweep", () => {
		const solver = new Solver(rule({ finish: 100 }));

		expect(read(solver, at(16, 2))[2]).toBe(POINTING);
		expect(read(solver, at(14, 2))[2]).toBe(SILENT);

		solver.sweep();
		solver.sweep();

		expect(read(solver, at(14, 2))[2]).toBe(POINTING);
		expect(read(solver, at(13, 2))[2]).toBe(SILENT);
	});

	it("tells every cell at once when progress pays", () => {
		const solver = new Solver(rule({ progress: true }));

		expect(read(solver, DOCK)[2]).toBe(POINTING);
		expect(read(solver, at(8, 8))[2]).toBe(POINTING);
	});
});
