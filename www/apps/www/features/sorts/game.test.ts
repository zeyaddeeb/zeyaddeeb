import { describe, expect, it } from "vitest";
import {
	create,
	type Event,
	FLOOR,
	type Game,
	LIVES,
	layout,
	MARGIN,
	MIN_COLS,
	PITCH,
	pull,
	resize,
	SLOTS,
	start,
	step,
	TURN,
	typeset,
	widest,
} from "./game";
import { pages } from "./pages";
import { read, widthOf } from "./sorts";

const still = { move: 0, target: null };

function calm(game: Game) {
	game.pace = { ...game.pace, slide: 0, shed: 0, aim: 0, feed: 1e9 };

	return game;
}

function run(game: Game, seconds: number, until?: Event) {
	const seen: Event[] = [];

	for (let t = 0; t < seconds; t += 1 / 60) {
		seen.push(...step(game, still, 1 / 60));

		if (until && seen.includes(until)) break;
	}

	return seen;
}

function playing(seed = 7) {
	const game = calm(create(seed, MIN_COLS, true));

	start(game);

	return game;
}

describe("out of sorts", () => {
	it("opens on the home page's own greeting", () => {
		const game = create(1);

		expect(game.phase).toBe("idle");
		expect(game.lines.map((line) => line.text)).toEqual([pages[0]?.[0]]);
		expect(game.lines[0]?.letters.map((letter) => letter.char).join("")).toBe(
			"ohhi",
		);
	});

	it("knocks one sort loose, drops it, and turns h into another letter", () => {
		const game = playing();
		const h = layout(game).find((spot) => spot.letter.char === "h");

		if (!h) throw new Error("No h");

		game.x = h.x + 1;
		pull(game);

		const seen = run(game, 2, "knock");

		expect(seen).toContain("knock");
		expect(game.score).toBe(10);
		expect(game.falling).toHaveLength(1);
		expect(read(h.letter.sorts)).toBe("l");
		expect(game.knocked.arch).toBe(1);
	});

	it("passes the dot through the hole of an o and strikes its rim", () => {
		const game = playing();
		const o = layout(game).find((spot) => spot.letter.char === "o");

		if (!o) throw new Error("No o");

		game.x = o.x + 1;
		pull(game);
		run(game, 2, "knock");

		expect(o.letter.sorts).toHaveLength(0);
		expect(game.falling[0]?.kind).toBe("ring");
	});

	it("hurts the i when a loose sort lands on it, then gives a moment of mercy", () => {
		const game = playing();

		game.falling.push({
			kind: "ring",
			rot: 0,
			x: game.x - 1,
			y: FLOOR - 4,
			vy: 0,
			tittle: false,
		});
		game.falling.push({
			kind: "ring",
			rot: 0,
			x: game.x - 1,
			y: FLOOR - 6,
			vy: 0,
			tittle: false,
		});

		const seen = run(game, 1);

		expect(seen.filter((event) => event === "hit")).toHaveLength(1);
		expect(game.lives).toBe(LIVES - 1);
	});

	it("ends when every dot is gone", () => {
		const game = playing();

		for (let i = 0; i < LIVES; i++) {
			game.mercy = 0;
			game.falling.push({
				kind: "dot",
				rot: 0,
				x: game.x,
				y: FLOOR + 2,
				vy: 0,
				tittle: true,
			});
			run(game, 0.1);
		}

		expect(game.phase).toBe("over");
		expect(game.ending).toBe("dots");
	});

	it("catches a falling sort with the dot", () => {
		const game = playing();

		game.falling.push({
			kind: "ring",
			rot: 0,
			x: game.x - 1,
			y: 20,
			vy: 0,
			tittle: true,
		});
		pull(game);

		expect(run(game, 1, "catch")).toContain("catch");
		expect(game.score).toBe(5);
		expect(game.falling).toHaveLength(0);
	});

	it("feeds the galley a line at a time and ends when type reaches the i", () => {
		const game = playing();

		game.pace = { ...game.pace, feed: 1 };
		run(game, 1.05);

		expect(game.lines.map((line) => [line.text, line.slot])).toEqual([
			["oh hi", 1],
			["who am i", 0],
		]);

		const seen = run(game, SLOTS);

		expect(seen).toContain("over");
		expect(game.ending).toBe("room");
		expect(game.lines[0]?.slot).toBe(SLOTS);
		expect(SLOTS * PITCH).toBe(FLOOR);
	});

	it("drops an i's tittle on the player standing under it", () => {
		const game = playing();
		const i = layout(game).find((spot) => spot.letter.char === "i");

		if (!i) throw new Error("No i");

		game.pace = { ...game.pace, aim: 1000 };
		game.x = i.x;
		run(game, 0.5);

		expect(game.falling.some((item) => item.tittle)).toBe(true);
		expect(i.letter.sorts.some((sort) => sort.kind === "dot")).toBe(false);
	});

	it("turns the page once every line is cleared", () => {
		const game = playing();

		game.queue = [];
		game.lines = [];

		expect(run(game, 0.1)).toContain("page");
		expect(game.phase).toBe("turn");

		run(game, TURN + 0.1);

		expect(game.phase).toBe("play");
		expect(game.run).toBe(1);
		expect(game.lines[0]?.text).toBe(pages[1]?.[0]);
		expect(game.score).toBe(100);
	});

	it("fits every line inside the narrowest page at its loosest tracking", () => {
		const game = create(3, MIN_COLS);

		for (const page of pages)
			for (const text of page) {
				const line = typeset(text, 0, 0);

				expect(widest(line), text).toBeLessThanOrEqual(MIN_COLS - 2 * MARGIN);
				game.lines = [line];

				for (let s = 0; s < 30; s += 0.2) {
					game.t = s;

					for (const spot of layout(game)) {
						const right = spot.x + widthOf(spot.letter.char);

						expect(spot.x).toBeGreaterThanOrEqual(MARGIN - 1e-9);
						expect(right).toBeLessThanOrEqual(MIN_COLS - MARGIN + 1e-9);
					}
				}
			}
	});

	it("keeps the i on the page when the window narrows", () => {
		const game = create(3, 80);

		game.x = 79;
		resize(game, 30);

		expect(game.cols).toBe(MIN_COLS);
		expect(game.x).toBe(MIN_COLS - 1);
	});
});
