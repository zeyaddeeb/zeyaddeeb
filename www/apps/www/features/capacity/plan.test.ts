import { describe, expect, it } from "vitest";
import { atlantic, carbon, level, world } from "./fixtures";
import { fromStart, measure, sceneOf, step, TRAINING, tap } from "./plan";

describe("tap", () => {
	it("fills as much as both ends allow", () => {
		const scene = sceneOf(atlantic);
		const { routes, outcome } = tap(world, scene, {}, "newyork", "keflavik");
		expect(outcome).toEqual({
			kind: "added",
			demand: "newyork",
			site: "keflavik",
			mw: 50,
		});
		expect(
			tap(world, scene, routes, "london", "keflavik").outcome,
		).toMatchObject({ mw: 10 });
	});

	it("refuses routes over the latency limit", () => {
		expect(
			tap(world, sceneOf(atlantic), {}, "london", "ashburn").outcome,
		).toEqual({
			kind: "far",
			demand: "london",
			site: "ashburn",
			rtt: 85,
		});
	});

	it("removes a route when tapped again", () => {
		const scene = sceneOf(atlantic);
		const first = tap(world, scene, {}, "newyork", "ashburn");
		const second = tap(world, scene, first.routes, "newyork", "ashburn");
		expect(second.routes).toEqual({});
		expect(second.outcome.kind).toBe("removed");
	});

	it("reports offline and full sites", () => {
		const scene = sceneOf(atlantic, ["ashburn"]);
		expect(tap(world, scene, {}, "newyork", "ashburn").outcome.kind).toBe(
			"offline",
		);
		const full = tap(world, sceneOf(atlantic), {}, "newyork", "keflavik");
		const more = tap(
			world,
			sceneOf(atlantic),
			full.routes,
			"toronto",
			"keflavik",
		);
		expect(
			tap(world, sceneOf(atlantic), more.routes, "london", "keflavik").outcome
				.kind,
		).toBe("full");
	});

	it("reaches the same optimum as the solver on the Atlantic level", () => {
		const scene = sceneOf(atlantic);
		let routes = {};
		for (const [d, s] of [
			["london", "keflavik"],
			["newyork", "ashburn"],
			["toronto", "keflavik"],
			["toronto", "ashburn"],
		])
			routes = tap(world, scene, routes, d, s).routes;
		expect(measure(world, scene, routes).total).toBe(7800);
	});

	it("charges dropped demand at the inference value", () => {
		const scene = sceneOf(atlantic);
		const { routes } = tap(world, scene, {}, "newyork", "keflavik");
		expect(measure(world, scene, routes).lost).toBe(70 * 1400);
	});
});

describe("carbon", () => {
	it("stops a fill when the budget runs out", () => {
		const scene = sceneOf(carbon);
		let routes = tap(world, scene, {}, "london", "madrid").routes;
		routes = tap(world, scene, routes, "paris", "lulea").routes;
		const { outcome } = tap(world, scene, routes, "berlin", "warsaw");
		expect(outcome).toMatchObject({ kind: "added" });
		if (outcome.kind === "added") expect(outcome.mw).toBeCloseTo(23 / 0.66, 4);
		expect(
			measure(
				world,
				scene,
				tap(world, scene, routes, "berlin", "warsaw").routes,
			).carbon,
		).toBeCloseTo(30);
	});

	it("reaches the solver's split with the steppers", () => {
		const scene = sceneOf(carbon);
		let routes = tap(world, scene, {}, "london", "madrid").routes;
		routes = tap(world, scene, routes, "paris", "lulea").routes;
		routes = tap(world, scene, routes, "berlin", "dublin").routes;
		for (let i = 0; i < 5; i++) {
			const next = step(world, scene, routes, "berlin", "dublin", -5);
			if (next) routes = next.routes;
		}
		routes = tap(world, scene, routes, "berlin", "warsaw").routes;
		const m = measure(world, scene, routes);
		expect(m.carbon).toBeCloseTo(30);
		expect(m.total).toBeCloseTo(13425);
	});
});

describe("training and outages", () => {
	it("lets training reach any online site", () => {
		const scene = sceneOf(level({ capacity: { keflavik: 60 }, training: 100 }));
		const { routes, outcome } = tap(world, scene, {}, TRAINING, "keflavik");
		expect(outcome).toMatchObject({ kind: "added", mw: 60 });
		expect(measure(world, scene, routes).lost).toBe(40 * 500);
	});

	it("drops the dead site from the morning plan", () => {
		const outage = level({
			start: [
				{ city: "newyork", site: "ashburn", mw: 70 },
				{ city: "toronto", site: "keflavik", mw: 30 },
			],
		});
		expect(fromStart(outage, ["ashburn"])).toEqual({ "toronto>keflavik": 30 });
	});
});
