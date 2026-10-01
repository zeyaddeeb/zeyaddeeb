import { describe, expect, it } from "vitest";
import { build, world } from "./fixtures";
import { copies } from "./levels";
import { measure, sceneOf } from "./plan";
import type { Solved } from "./protocol";
import { namer } from "./script";

const finale = copies.find((c) => c.id === "build");

const result = (patch: Partial<Solved>): Solved => ({
	routes: [],
	training: [],
	dropped: {},
	droppedTraining: 0,
	build: { keflavik: 1 },
	totals: {
		energy: 0,
		lost: 0,
		build: 0,
		total: 0,
		carbon: 0,
		served: 0,
		demand: 0,
	},
	key: null,
	upgrades: {},
	duals: {},
	carbonPrice: null,
	carbonDual: null,
	buildAllCost: null,
	solver: {
		engine: "SCIP + GLOP",
		variables: 0,
		constraints: 0,
		iterations: 0,
		ms: 0,
	},
	...patch,
});

const context = (solved: Solved) => ({
	world,
	level: build,
	solved,
	yours: measure(world, sceneOf(build), {}),
	name: namer(world),
});

describe("the finale", () => {
	it("says the solver left customers short on purpose", () => {
		const solved = result({ dropped: { london: 5 }, buildAllCost: 9350 });

		expect(finale?.aha(context(solved))).toBe(
			"It left london 5 MW short on purpose: the last block would cost $9,350 an hour more than the customers it wins back.",
		);
	});

	it("keeps it short when every block was worth building", () => {
		expect(finale?.matched(context(result({})))).toBe(
			"That’s the optimum. Every block it was offered paid for itself.",
		);
	});
});
