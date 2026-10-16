import { describe, expect, it } from "vitest";
import {
	at,
	BUOYS,
	CLOCKS,
	clockOf,
	DOCK,
	FINISH,
	HEADLANDS,
	kinds,
	RESPAWN,
	ROCKS,
	STRUCK,
	TICK,
	timersOf,
	UP,
	waters,
	xy,
} from "./chart";
import {
	everyRule,
	GAMMA,
	keyOf,
	NOTHING,
	OPENING,
	type Rule,
	toggle,
} from "./rule";
import { Solver, solve } from "./solver";

const rule = (parts: Partial<Rule>): Rule => ({ ...NOTHING, ...parts });

function swept(r: Rule, sweeps: number) {
	const solver = new Solver(r);

	for (let i = 0; i < sweeps; i++) solver.sweep();

	return solver;
}

describe("chart", () => {
	it("puts the dock sixteen moves from the line, walled or not", () => {
		expect(waters(false).away[DOCK]).toBe(16);
		expect(waters(true).away[DOCK]).toBe(16);
		expect(FINISH.every((cell) => waters(false).away[cell] === 0)).toBe(true);
	});

	it("keeps the rocks closer to the dock than the line", () => {
		const [dx, dy] = xy(DOCK);
		const near = Math.min(
			...ROCKS.map((cell) => {
				const [x, y] = xy(cell);

				return Math.max(Math.abs(x - dx), Math.abs(y - dy));
			}),
		);

		expect(near).toBe(2);
	});

	it("spaces the buoys so one lap takes longer than a buoy needs", () => {
		const lap = BUOYS.reduce((sum, cell, i) => {
			const [x, y] = xy(cell);
			const [nx, ny] = xy(BUOYS[(i + 1) % BUOYS.length] ?? cell);

			return sum + Math.max(Math.abs(nx - x), Math.abs(ny - y));
		}, 0);

		expect(lap).toBe(6);
		expect(lap).toBeGreaterThan(RESPAWN);
	});

	it("draws a shape over every land cell and nothing else", () => {
		const drawn = new Set(
			HEADLANDS.flatMap((land) =>
				Array.from({ length: land.wide * land.tall }, (_, i) =>
					at(land.x + (i % land.wide), land.y + Math.floor(i / land.wide)),
				),
			),
		);
		const land = kinds.flatMap((kind, cell) => (kind === "land" ? [cell] : []));

		expect([...drawn].sort((a, b) => a - b)).toEqual(land);
	});

	it("counts buoys down and knocks them over", () => {
		const clock = clockOf([0, 3, 5]);

		expect(timersOf(TICK[clock] ?? 0)).toEqual([0, 2, 4]);
		expect(UP[0]?.[clock]).toBe(1);
		expect(UP[1]?.[clock]).toBe(0);
		expect(timersOf(STRUCK[0]?.[clock] ?? 0)).toEqual([RESPAWN, 3, 5]);
		expect(CLOCKS).toBe(216);
	});

	it("only lets the boat push the scoreboard when the wall is down", () => {
		const beside = at(13, 7) * 9 + 3;

		expect(waters(false).nudge.some((n) => n === 1)).toBe(false);
		expect(waters(true).nudge[beside]).toBe(1);
		expect(waters(true).to[beside]).toBe(at(13, 7));
	});
});

describe("rule", () => {
	it("lists every contract once", () => {
		const keys = new Set(everyRule().map(keyOf));

		expect(keys.size).toBe(96);
	});

	it("turns the prize on at the chosen size and off again", () => {
		const on = toggle(NOTHING, "finish", 1000);

		expect(on.finish).toBe(1000);
		expect(toggle(on, "finish", 1000).finish).toBe(0);
		expect(toggle(NOTHING, "time", 100).time).toBe(true);
	});
});

describe("solver", () => {
	it("matches plain value iteration", () => {
		const rules = [
			rule({ finish: 100 }),
			rule({ time: true }),
			rule({ progress: true }),
			rule({ time: true, crash: true }),
			rule({ reach: true }),
		];

		for (const r of rules) {
			const exact = solve(r);
			const slow = swept(r, 600);

			for (let s = 0; s < exact.size; s++)
				expect(exact.value[s]).toBeCloseTo(slow.value[s] ?? 0, 6);
		}
	});

	it("matches value iteration with the buoys in play", () => {
		const exact = solve(OPENING);
		const slow = swept(OPENING, 300);
		let worst = 0;

		for (let s = 0; s < exact.size; s++)
			worst = Math.max(
				worst,
				Math.abs((exact.value[s] ?? 0) - (slow.value[s] ?? 0)),
			);

		expect(worst).toBeLessThan(1e-4);
	}, 30_000);

	it("leaves no better move anywhere", () => {
		for (const r of [OPENING, rule({ buoy: true, finish: 100, time: true })]) {
			const solver = solve(r);
			const before = Float64Array.from(solver.value);

			expect(solver.sweep()).toBeLessThan(1e-9);
			solver.value.set(before);
		}
	});

	it("prices the lagoon lap as five points a second, forever", () => {
		const solver = solve(OPENING);
		const start = solver.index(BUOYS[0] ?? 0, 0);

		expect(solver.value[start]).toBeCloseTo(10 / (1 - GAMMA ** 2), 9);
	});

	it("values a prize by how far away it is", () => {
		const solver = solve(rule({ finish: 100 }));

		expect(solver.value[DOCK]).toBeCloseTo(100 * GAMMA ** 15, 9);
		expect(solver.best(DOCK, 0).still).toBe(false);
	});

	it("is indifferent when nothing pays", () => {
		const solver = solve(rule({ crash: true }));

		expect(solver.value[DOCK]).toBe(0);
		expect(solver.best(DOCK, 0).still).toBe(true);
	});

	it("keeps one answer per rule", () => {
		expect(solve(OPENING)).toBe(solve({ ...OPENING }));
	});
});
