import { describe, expect, it } from "vitest";
import { acts, chapters, nextLabel, stages } from "./acts";
import { octilinear } from "./geometry";
import {
	advance,
	answerOf,
	breakIt,
	choiceOf,
	complete,
	type GridGame,
	type GridSolutions,
	gridBoard,
	gridPickable,
	nextQuestion,
	nextStep,
	pickLine,
	pickSubstation,
	reveal,
	rightPicks,
	type Script,
	selectCampus,
	startGrid,
	think,
} from "./grid-game";
import { placeTags } from "./grid-geometry";
import { dark, darkness, gridCopies, gridNames } from "./grid-levels";
import { gridNarrate } from "./grid-script";
import type { GridLevel, GridSolved, GridWorld } from "./protocol";

const campuses = [
	{ id: "alpha", mw: 300 },
	{ id: "beta", mw: 200 },
];

const siting: GridLevel = {
	id: "siting",
	campuses,
	placement: null,
	candidates: [],
	maxBuild: 0,
	switching: false,
	lure: ["alpha", "yardley"],
	hubCapacity: {},
	prices: false,
};

const wires: GridLevel = {
	id: "wires",
	campuses,
	placement: { alpha: "waxpool", beta: "yardley" },
	candidates: ["goosecreek-waxpool", "loudoun-yardley"],
	maxBuild: 1,
	switching: true,
	lure: null,
	hubCapacity: {},
	prices: false,
};

const line = (a: string, b: string, limit = 400) => ({
	id: `${a}-${b}`,
	a,
	b,
	km: 8,
	limit,
	cost: 240,
});

const grid: GridWorld = {
	hubs: [
		{
			id: "goosecreek",
			name: "Goose Creek",
			lat: 0,
			lon: 0,
			price: 45,
			capacity: 850,
		},
		{
			id: "loudoun",
			name: "Loudoun",
			lat: 0,
			lon: 0,
			price: 62,
			capacity: 1000,
		},
	],
	substations: [
		{
			id: "waxpool",
			name: "Waxpool",
			place: "Ashburn",
			lat: 0,
			lon: 0,
			load: 250,
			land: 30,
		},
		{
			id: "yardley",
			name: "Yardley Ridge",
			place: "Arcola",
			lat: 0,
			lon: 0,
			load: 100,
			land: 7,
		},
		{
			id: "brambleton",
			name: "Brambleton",
			place: "Brambleton",
			lat: 0,
			lon: 0,
			load: 100,
			land: 9,
		},
	],
	lines: [line("loudoun", "brambleton"), line("yardley", "waxpool", 600)],
	candidates: [
		line("goosecreek", "waxpool", 500),
		line("loudoun", "yardley", 500),
	],
	levels: [siting, wires],
	values: { shed: 1400, buildPerKm: 30 },
};

const names = gridNames(grid);
const context = { grid, name: names.name, before: 0 };

const solved = (patch: Partial<GridSolved> = {}): GridSolved => ({
	placement: {},
	built: [],
	opened: [],
	flows: {},
	supply: {},
	shed: {},
	binding: [],
	totals: {
		energy: 0,
		lost: 0,
		land: 0,
		build: 0,
		total: 0,
		served: 0,
		demand: 0,
	},
	key: null,
	candidates: {},
	prices: {},
	trace: [],
	solver: { engine: "GLOP", variables: 0, constraints: 0, nodes: 0, ms: 1 },
	...patch,
});

const none: GridSolutions = {
	best: null,
	yours: null,
	preview: null,
	today: null,
	live: null,
};

const script = (steps = 0): Script => ({ steps, questions: [] });

const planning = (level: GridLevel): GridGame => startGrid(level, script());

describe("acts", () => {
	it("gives every act exactly three chapters, in order", () => {
		for (const act of acts) {
			const own = chapters.filter((c) => c.act === act);

			expect(own.map((c) => c.number)).toEqual([1, 2, 3]);
		}
	});

	it("keeps every Act 1 level, two parts to a chapter", () => {
		const first = stages.filter((s) => s.chapter.act.number === 1);

		expect(first.map((s) => s.copy.id)).toEqual([
			"atlantic",
			"asia",
			"training",
			"carbon",
			"outage",
			"build",
		]);

		expect(first.map((s) => `${s.chapter.number}.${s.part + 1}`)).toEqual([
			"1.1",
			"1.2",
			"2.1",
			"2.2",
			"3.1",
			"3.2",
		]);
	});

	it("labels the next button by what comes next", () => {
		expect(nextLabel(0)).toBe("Next part");
		expect(nextLabel(1)).toBe("Next chapter");
		expect(nextLabel(5)).toBe("Next act");
		expect(nextLabel(stages.length - 1)).toBeNull();
	});

	it("paints every chapter a different color", () => {
		const colors = chapters.map((c) => c.line.color);

		expect(new Set(colors).size).toBe(colors.length);
	});
});

describe("the guide", () => {
	it("walks every step before handing over the map", () => {
		const steps = gridCopies[0].guide.length;
		let game = startGrid(siting, script(steps));

		expect(game.phase).toBe("guide");

		for (let i = 1; i < steps; i++) {
			game = nextStep(game, script(steps));
			expect(game).toMatchObject({ phase: "guide", step: i });
		}

		expect(nextStep(game, script(steps)).phase).toBe("plan");
	});

	it("keeps the map read-only while guiding", () => {
		const game = startGrid(siting, script(2));

		expect(gridPickable(game, siting)).toEqual({
			substations: false,
			lines: false,
		});

		expect(pickSubstation(game, siting, "dulles")).toBe(game);
	});
});

describe("siting campuses", () => {
	it("places the selected campus and moves on to the next", () => {
		let game = planning(siting);

		expect(game.campus).toBe("alpha");
		game = pickSubstation(game, siting, "dulles");
		expect(game.placement).toEqual({ alpha: "dulles" });
		expect(game.campus).toBe("beta");
		expect(complete(game, siting)).toBe(false);
		game = pickSubstation(game, siting, "yardley");
		expect(complete(game, siting)).toBe(true);
		expect(game.campus).toBeNull();

		expect(choiceOf(game, siting)).toEqual({
			placement: { alpha: "dulles", beta: "yardley" },
		});
	});

	it("moves a placed campus once it is selected again", () => {
		let game = pickSubstation(planning(siting), siting, "dulles");

		game = pickSubstation(game, siting, "yardley");
		game = pickSubstation(selectCampus(game, "alpha"), siting, "sterling");
		expect(game.placement.alpha).toBe("sterling");
	});

	it("ignores taps on substations when nothing is selected", () => {
		let game = pickSubstation(planning(siting), siting, "dulles");

		game = pickSubstation(game, siting, "yardley");
		expect(pickSubstation(game, siting, "belmont")).toBe(game);
	});
});

describe("wiring", () => {
	it("builds at most one new line, replacing the last", () => {
		let game = pickLine(planning(wires), wires, "goosecreek-waxpool", context);

		expect(game.built).toEqual(["goosecreek-waxpool"]);
		game = pickLine(game, wires, "loudoun-yardley", context);
		expect(game.built).toEqual(["loudoun-yardley"]);
		game = pickLine(game, wires, "loudoun-yardley", context);
		expect(game.built).toEqual([]);
	});

	it("opens and closes breakers on existing lines", () => {
		let game = pickLine(planning(wires), wires, "yardley-waxpool", context);

		expect(game.opened).toEqual(["yardley-waxpool"]);
		expect(game.outcome).toEqual({ kind: "opened", line: "yardley-waxpool" });
		game = pickLine(game, wires, "yardley-waxpool", context);
		expect(game.opened).toEqual([]);
		expect(choiceOf(game, wires)).toEqual({ built: [], opened: [] });
	});

	it("trips only existing lines when breaking it", () => {
		let game = breakIt(reveal(planning(wires)));

		game = pickLine(game, wires, "loudoun-brambleton", context);
		expect(game.play.tripped).toEqual(["loudoun-brambleton"]);
		expect(game.edit?.label).toBe("Loudoun–Brambleton tripped");
		expect(pickLine(game, wires, "loudoun-yardley", context)).toBe(game);
	});
});

describe("the board", () => {
	it("shows the guide preview, then yours, then the solver in ink", () => {
		const preview = solved({ supply: { loudoun: 600 } });
		const yours = solved({ supply: { loudoun: 700 } });
		const best = solved({ supply: { loudoun: 800 }, candidates: { x: 1 } });
		const all = { ...none, preview, yours, best };
		const guide = startGrid(siting, script(2));

		expect(gridBoard(guide, all, script(2), ["dulles-loudoun"])).toMatchObject({
			solved: preview,
			focus: ["dulles-loudoun"],
		});

		expect(gridBoard(planning(siting), all, script()).solved).toBe(yours);

		const shown = gridBoard(reveal(planning(siting)), all, script());

		expect(shown).toMatchObject({ solved: best, solver: true });
		expect(shown.candidates).toEqual({ x: 1 });
	});
});

describe("watching the solver think", () => {
	const trace = [1000, 400, 100].map((total, i) => ({
		ms: i + 1,
		total,
		bound: i === 2 ? 100 : null,
		nodes: i * 10 + 1,
		flow: solved({ opened: [`line-${i}`] }),
	}));

	const best = solved({ trace, totals: { ...solved().totals, total: 100 } });

	it("steps through each plan the solver found, then reveals", () => {
		let game = think(planning(wires));
		const all = { ...none, best };

		expect(gridBoard(game, all, script()).solved?.opened).toEqual(["line-0"]);
		game = advance(game, trace.length);
		expect(gridBoard(game, all, script()).solved?.opened).toEqual(["line-1"]);
		game = advance(advance(game, trace.length), trace.length);
		expect(game.phase).toBe("solved");
		expect(gridBoard(game, all, script()).solved).toBe(best);
	});

	it("narrates the proof on the last plan", () => {
		const game = { ...think(planning(wires)), frame: 2 };

		const text = gridNarrate({
			phase: game.phase,
			step: 0,
			copy: gridCopies[1],
			grid,
			level: wires,
			names,
			outcome: null,
			complete: true,
			yours: null,
			best,
			live: null,
			guide: { grid, level: wires, shown: null, today: null, ...names },
			revealed: true,
			won: false,
			edit: null,
			frame: 2,
			question: 0,
			picks: [],
			script: script(),
		}).text;

		expect(text).toContain("The bound caught up at node 21");
	});
});

describe("price questions", () => {
	const quiz: Script = { steps: 0, questions: ["max", "min"] };
	const prices = { waxpool: 56, yardley: 62, brambleton: 65 };
	const best = solved({ prices });
	const all = { ...none, best, yours: solved() };

	it("hides every price until a pick, then shows only the pick and the answer", () => {
		let game = startGrid(wires, quiz);

		expect(game.phase).toBe("ask");
		expect(gridBoard(game, all, quiz).prices).toBeNull();
		game = pickSubstation(game, wires, "yardley");
		expect(game.phase).toBe("told");

		expect(gridBoard(game, all, quiz).prices).toEqual({
			yardley: 62,
			brambleton: 65,
		});
	});

	it("reveals every price after the last question and scores both picks", () => {
		let game = pickSubstation(startGrid(wires, quiz), wires, "brambleton");

		game = pickSubstation(nextQuestion(game, quiz), wires, "yardley");
		expect(gridBoard(game, all, quiz).prices).toEqual(prices);
		expect(rightPicks(game, quiz, prices)).toEqual([true, false]);
		expect(answerOf(prices, "min")).toBe("waxpool");
	});
});

describe("narration", () => {
	it("names who goes dark and which line is full", () => {
		const out = solved({
			shed: { brambleton: 80, yardley: 2 },
			binding: ["loudoun-brambleton"],
		});

		expect(dark(out)).toBe(82);

		expect(darkness(out, names)).toBe(
			"Brambleton loses 80 MW and Yardley Ridge loses 2 MW: Loudoun–Brambleton is full.",
		);
	});

	it("asks for the second campus until both are placed", () => {
		const game = pickSubstation(planning(siting), siting, "waxpool");

		const text = gridNarrate({
			phase: game.phase,
			step: 0,
			copy: gridCopies[0],
			grid,
			level: siting,
			names,
			outcome: game.outcome,
			complete: false,
			yours: solved({ placement: { alpha: "waxpool" } }),
			best: null,
			live: null,
			guide: { grid, level: siting, shown: null, today: null, ...names },
			revealed: false,
			won: false,
			edit: null,
			frame: 0,
			question: 0,
			picks: [],
			script: script(),
		}).text;

		expect(text).toBe(
			"The 300 MW campus plugs into Waxpool. Now place the 200 MW campus.",
		);
	});

	it("keeps every guide step short enough for four lines on a phone", () => {
		const shown = solved({
			flows: { "dulles-loudoun": 300, "loudoun-brambleton": 300 },
			shed: { brambleton: 80 },
			binding: ["loudoun-brambleton"],
		});

		for (const copy of gridCopies) {
			const level = copy.id === "wires" ? wires : siting;
			const guide = { grid, level, shown, today: solved(), ...names };

			for (const step of copy.guide)
				expect(step.text(guide).length).toBeLessThanOrEqual(190);

			expect(copy.ask.length).toBeLessThanOrEqual(190);
		}
	});
});

describe("line tags", () => {
	it("slides a tag along its track to dodge a label", () => {
		const track = octilinear({ x: 0, y: 0 }, { x: 200, y: 0 });
		const label = { x0: 80, y0: -10, x1: 120, y1: 10 };

		const spot = placeTags(
			[{ id: "a-b", track, width: 40, height: 14 }],
			[label],
		).get("a-b");

		expect(spot).toBeDefined();
		expect(spot?.y).toBe(0);
		expect(Math.abs((spot?.x ?? 100) - 100)).toBeGreaterThan(20);
	});

	it("drops a tag that has nowhere to go", () => {
		const track = octilinear({ x: 0, y: 0 }, { x: 40, y: 0 });
		const wall = { x0: -50, y0: -50, x1: 90, y1: 50 };

		expect(
			placeTags([{ id: "a-b", track, width: 30, height: 14 }], [wall]).size,
		).toBe(0);
	});
});
