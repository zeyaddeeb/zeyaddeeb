import { describe, expect, it } from "vitest";
import { atlantic, build, outage, world } from "./fixtures";
import {
	askGuess,
	board,
	breakIt,
	cutPower,
	type Game,
	pickable,
	pickNode,
	restart,
	reveal,
	showView,
	start,
	yours,
} from "./game";
import type { NodeKind } from "./plan";
import type { Level, Solved } from "./protocol";

const solved = (routes: Solved["routes"], total = 0): Solved => ({
	routes,
	training: [],
	dropped: {},
	droppedTraining: 0,
	build: {},
	totals: {
		energy: total,
		lost: 0,
		build: 0,
		total,
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
		engine: "GLOP",
		variables: 0,
		constraints: 0,
		iterations: 0,
		ms: 0,
	},
});

const kind = (level: Level, id: string): NodeKind =>
	id in level.capacity ? "site" : "city";

function tapAll(game: Game, level: Level, ids: string[], before = 0): Game {
	return ids.reduce(
		(g, id) =>
			pickNode(
				g,
				{ world, level, before, name: (x) => x },
				id,
				kind(level, id),
			),
		game,
	);
}

describe("starting a level", () => {
	it("opens straight into planning", () => {
		expect(start(atlantic)).toMatchObject({ phase: "plan", routes: {} });
	});

	it("opens an outage on the morning plan", () => {
		const game = start(outage);

		expect(game.phase).toBe("intro");
		expect(game.routes["newyork>ashburn"]).toBe(70);
	});

	it("drops the dead site's routes when the power goes", () => {
		const game = cutPower(start(outage), outage);

		expect(game.phase).toBe("plan");
		expect(game.routes).toEqual({ "toronto>quebec": 30, "chicago>quebec": 30 });

		expect(restart({ ...game, routes: {} }, outage).routes).toEqual(
			game.routes,
		);
	});
});

describe("routing by tapping", () => {
	it("routes a city to a data center", () => {
		const game = tapAll(start(atlantic), atlantic, ["newyork", "keflavik"]);

		expect(game.routes).toEqual({ "newyork>keflavik": 50 });
		expect(game.outcome?.kind).toBe("added");
	});

	it("works in either order", () => {
		const game = tapAll(start(atlantic), atlantic, ["keflavik", "london"]);

		expect(game.routes).toEqual({ "london>keflavik": 40 });
	});

	it("switches the selection between two cities", () => {
		const game = tapAll(start(atlantic), atlantic, ["newyork", "london"]);

		expect(game.selected).toBe("london");
		expect(game.routes).toEqual({});
	});

	it("deselects when the same node is tapped twice", () => {
		expect(
			tapAll(start(atlantic), atlantic, ["newyork", "newyork"]).selected,
		).toBeNull();
	});
});

describe("building blocks", () => {
	it("adds blocks up to the limit", () => {
		const game = tapAll(start(build), build, [
			"keflavik",
			"keflavik",
			"ashburn",
		]);

		expect(game.blocks).toEqual({ keflavik: 2 });
	});

	it("only lets sites be picked", () => {
		expect(pickable(start(build), build)).toEqual(["site"]);
	});
});

describe("after the reveal", () => {
	it("takes one guess and ignores the rest", () => {
		const game = askGuess(reveal(start(atlantic)));
		const guessed = tapAll(game, atlantic, ["keflavik", "ashburn"]);

		expect(guessed.pick).toBe("keflavik");
	});

	it("cuts and restores a site's power in play", () => {
		const game = breakIt(reveal(start(atlantic)), atlantic);
		const cut = tapAll(game, atlantic, ["keflavik"], 7800);

		expect(cut.play.offline).toEqual(["keflavik"]);
		expect(cut.edit).toEqual({ label: "keflavik offline", before: 7800 });
		expect(tapAll(cut, atlantic, ["keflavik"]).play.offline).toEqual([]);
	});

	it("shows the solver's plan over a ghost of yours", () => {
		const mine = tapAll(start(atlantic), atlantic, ["newyork", "keflavik"]);
		const best = solved([{ city: "london", site: "keflavik", mw: 40 }]);

		const shown = board(reveal(mine), atlantic, {
			best,
			built: null,
			live: null,
		});

		expect(shown.routes).toEqual({ "london>keflavik": 40 });
		expect(shown.ghost).toEqual({ "newyork>keflavik": 50 });
		expect(shown.solver).toBe(true);
	});

	it("shows your own plan when asked", () => {
		const mine = showView(
			reveal(tapAll(start(atlantic), atlantic, ["newyork", "keflavik"])),
			"yours",
		);

		const shown = board(mine, atlantic, {
			best: solved([]),
			built: null,
			live: null,
		});

		expect(shown.routes).toEqual({ "newyork>keflavik": 50 });
		expect(shown.ghost).toBeNull();
	});
});

describe("scoring your plan", () => {
	it("charges for dropped demand", () => {
		const game = tapAll(start(atlantic), atlantic, ["newyork", "keflavik"]);

		expect(yours(game, world, atlantic, null).dropped).toBe(70);
	});

	it("scores a build with the solver's routing and the block cost", () => {
		const game = { ...start(build), blocks: { keflavik: 1 } };
		const built = solved([{ city: "london", site: "keflavik", mw: 55 }]);
		const metrics = yours(game, world, build, built);

		expect(metrics.build).toBe(25 * 900);
		expect(metrics.served.london).toBe(55);
	});
});
