import { describe, expect, it } from "vitest";
import {
	activeIn,
	advancePlan,
	cycleStart,
	lockGuess,
	mapView,
	nextPlanStep,
	scheduleOf,
	setDraft,
	setRental,
	setSize,
	shownPlan,
	startPlan,
	thinkPlan,
	toggleOpen,
} from "./plan-game";
import { planCopies } from "./plan-levels";
import type {
	GridWorld,
	PlanLevel,
	PlanSolved,
	PlansWorld,
	Project,
} from "./protocol";

const project = (patch: Partial<Project> & { id: string }): Project => ({
	kind: "line",
	target: patch.id,
	mw: 100,
	lead: 1,
	cost: 100,
	fuel: 0,
	blocks: 0,
	...patch,
});

const transformer = project({
	id: "goosecreek-transformer",
	kind: "hub",
	target: "goosecreek",
	mw: 300,
	lead: 3,
});
const rebuild = project({
	id: "loudoun-brambleton",
	kind: "upgrade",
	target: "loudoun-brambleton",
	mw: 250,
});
const turbines = project({
	id: "turbines-yardley",
	kind: "turbine",
	target: "yardley",
	blocks: 3,
});
const preorder = project({
	id: "preorder-yardley",
	kind: "plant",
	target: "yardley",
	blocks: 6,
	lead: 0,
});

const years = ["2027", "2028", "2029", "2030"].map((label, period) => ({
	id: `y${label}`,
	label,
	weight: 0.25,
	period,
	campuses: [["waxpool", 300]] as [string, number][],
}));

const lead: PlanLevel = {
	id: "lead",
	cases: years,
	projects: [transformer.id, rebuild.id],
	periods: 3,
	crews: 1,
	budget: null,
	objective: "expected",
	rentals: [turbines.id],
	recourse: false,
	switching: true,
};

const futures: PlanLevel = {
	...lead,
	id: "average",
	cases: years.slice(0, 3).map((c) => ({ ...c, period: 0 })),
	projects: [preorder.id],
	periods: 1,
	crews: 6,
	rentals: [],
	recourse: true,
	switching: false,
};

const plans: PlansWorld = {
	projects: [transformer, rebuild, turbines, preorder],
	levels: [lead, futures],
};

const grid = {
	hubs: [{ id: "goosecreek", capacity: 850 }],
	lines: [{ id: "loudoun-brambleton", limit: 400 }],
} as unknown as GridWorld;

const planning = (level: PlanLevel) =>
	startPlan(level, { steps: 0, guessing: false });

describe("scheduling projects", () => {
	it("cycles a start through the years and back to never", () => {
		let game = planning(lead);

		game = cycleStart(game, lead, transformer.id);
		expect(game.starts[transformer.id]).toEqual({ period: 0, count: 1 });

		game = cycleStart(
			cycleStart(game, lead, transformer.id),
			lead,
			transformer.id,
		);

		expect(game.starts[transformer.id]?.period).toBe(2);
		game = cycleStart(game, lead, transformer.id);
		expect(game.starts[transformer.id]).toBeUndefined();
	});

	it("skips years the one crew is already using", () => {
		let game = cycleStart(planning(lead), lead, transformer.id);

		game = cycleStart(game, lead, rebuild.id);
		expect(game.starts[rebuild.id]?.period).toBe(1);
	});

	it("sends starts, rentals and breakers to the service", () => {
		let game = cycleStart(planning(lead), lead, transformer.id);

		game = setRental(game, turbines, "y2028", 2);

		game = toggleOpen(
			{ ...game, view: "y2028" },
			lead,
			"yardley-waxpool",
			true,
		);

		expect(scheduleOf(game, lead)).toEqual({
			starts: [{ project: transformer.id, period: 0, count: 1 }],
			rentals: [{ project: turbines.id, case: "y2028", blocks: 2 }],
			opened: [{ line: "yardley-waxpool", case: "y2028" }],
		});
	});

	it("sizes a pre-order within its blocks", () => {
		const game = setSize(planning(futures), preorder, 9);

		expect(game.starts[preorder.id]).toEqual({ period: 0, count: 6 });
		expect(setSize(game, preorder, 0).starts).toEqual({});
	});

	it("counts a project as live only after its lead time", () => {
		const schedule = {
			starts: [{ project: transformer.id, period: 0, count: 1 }],
			rentals: [],
			opened: [],
		};

		expect(activeIn(schedule, transformer, 2)).toBe(0);
		expect(activeIn(schedule, transformer, 3)).toBe(1);
	});
});

describe("the map for a year", () => {
	it("shows upgrades as higher limits and capacity once they are live", () => {
		const schedule = {
			starts: [
				{ project: transformer.id, period: 0, count: 1 },
				{ project: rebuild.id, period: 1, count: 1 },
			],
			rentals: [],
			opened: [],
		};

		const early = mapView(lead, plans, grid, schedule, undefined, "y2028");

		expect(early.level.hubCapacity).toEqual({});
		expect(early.limits).toEqual({});

		const late = mapView(lead, plans, grid, schedule, undefined, "y2030");

		expect(late.level.hubCapacity).toEqual({ goosecreek: 1150 });
		expect(late.limits).toEqual({ "loudoun-brambleton": 650 });
		expect(late.level.placement).toEqual({ waxpool0: "waxpool" });
	});
});

describe("replaying and guessing", () => {
	const solved = (total: number): PlanSolved => ({
		schedule: { starts: [], rentals: [], opened: [] },
		cases: [],
		total,
		worst: total,
		key: null,
		hedge: null,
		trace: [100, 50].map((t) => ({
			ms: 1,
			total: t,
			bound: null,
			nodes: 1,
			schedule: { starts: [], rentals: [], opened: [] },
			cases: [],
		})),
		solver: {
			engine: "SCIP + GLOP",
			variables: 1,
			constraints: 1,
			nodes: 1,
			ms: 1,
		},
	});

	it("walks the trace and lands on the solver's plan", () => {
		let game = thinkPlan(planning(lead));
		const best = solved(50);

		expect(shownPlan(game, { best, yours: null }).solver).toBe(true);
		game = advancePlan(advancePlan(game, 2), 2);
		expect(game.phase).toBe("solved");
	});

	it("locks a guess only while guessing", () => {
		let game = startPlan(futures, { steps: 1, guessing: true });

		game = nextPlanStep(game, { steps: 1, guessing: true });
		expect(game.phase).toBe("guess");
		game = lockGuess(setDraft(game, 7000));
		expect(game).toMatchObject({ phase: "told", guess: 7000 });
		expect(setDraft(game, 1).draft).toBe(7000);
	});

	it("keeps every Act 3 and 4 guide step short enough for a phone", () => {
		const names = {
			name: (id: string) => id,
			line: () => undefined,
			project: () => undefined,
			projectName: (id: string) => id,
			period: () => "2027",
		};

		for (const copy of planCopies) {
			for (const step of copy.guide)
				expect(step.text({ ...names, level: lead }).length).toBeLessThanOrEqual(
					190,
				);

			expect(copy.ask.length).toBeLessThanOrEqual(190);
		}
	});
});
