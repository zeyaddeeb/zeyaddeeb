import { describe, expect, it } from "vitest";
import {
	CAPTIONS,
	caption,
	FIRST,
	inside,
	onPaper,
	outside,
	PINNED,
	PLATES,
	SEEN,
	SPOTS,
} from "./account";
import { clockAt, lengthOf, progress, spansOf, startOf } from "./beats";
import {
	ARRANGEMENTS,
	atlas,
	EVERY,
	HOME,
	mend,
	NEAR,
	odd,
	rank,
	slide,
	way,
} from "./boards";
import { dealt, foundBy, ROOMS, STUCK } from "./deal";
import { AS_RUN, BUDGETS, everySheet, flip, keyOf, type Sheet } from "./sheet";
import { DOORS, hope, judge, OPENS, plan, tallyAt } from "./trial";

const sheet = (parts: Partial<Sheet>): Sheet => ({ ...AS_RUN, ...parts });
const told = (read: boolean, guard: boolean) =>
	sheet({
		read: { told: read, fact: false },
		guard: { told: guard, fact: false },
	});

describe("boards", () => {
	it("reaches exactly half of all arrangements by sliding", () => {
		const { depth, order, reached, deepest } = atlas();

		expect(reached).toBe(EVERY);
		expect(EVERY).toBe(181_440);
		expect(ARRANGEMENTS).toBe(2 * EVERY);
		expect(deepest).toBe(31);
		expect(depth.filter((d) => d === 31)).toHaveLength(2);
		expect(depth[rank(HOME)]).toBe(0);
		expect(order[rank(HOME)]).toBe(0);
		expect(depth[rank(NEAR)]).toBe(-1);
	});

	it("never reaches a board with two tiles swapped", () => {
		const { depth } = atlas();
		const reached = (cells: Uint8Array) => (depth[rank(cells)] ?? -1) >= 0;

		for (const room of dealt().rooms) {
			expect(reached(room.sound)).toBe(true);
			expect(odd(room.sound)).toBe(false);
			expect(reached(mend(room.sound))).toBe(false);
			expect(odd(mend(room.sound))).toBe(true);
		}
	});

	it("slides every sound board home in as few moves as its depth", () => {
		for (const room of dealt().rooms) {
			const cells = Uint8Array.from(room.sound);
			const moves = way(cells);

			for (const to of moves) slide(cells, to);

			expect(moves).toHaveLength(room.depth);
			expect([...cells]).toEqual([...HOME]);
		}
	});

	it("leaves a stuck board two tiles short of home", () => {
		const hall = dealt();

		for (const index of hall.stuck) {
			const room = hall.rooms[index];

			if (!room) continue;

			const cells = Uint8Array.from(room.dealt);

			for (const to of way(room.sound)) slide(cells, to);

			expect(way(room.dealt)).toEqual([]);
			expect([...cells]).toEqual([...NEAR]);
		}
	});
});

describe("the deal", () => {
	it("deals 898 boards and 198 of them cannot be solved", () => {
		const hall = dealt();

		expect(hall.rooms).toHaveLength(ROOMS);
		expect(hall.stuck).toHaveLength(STUCK);
		expect(hall.rooms.filter((room) => odd(room.dealt))).toHaveLength(STUCK);
		expect(hall.able).toHaveLength(ROOMS - STUCK);
		expect(hall.every).toHaveLength(ROOMS);
		expect(STUCK / ROOMS).toBeCloseTo(0.22, 2);
	});

	it("deals the same boards every time and none that start close to home", () => {
		const hall = dealt();
		const depths = hall.rooms.map((room) => room.depth);

		expect(dealt()).toBe(hall);
		expect(Math.min(...depths)).toBeGreaterThanOrEqual(8);
		expect(Math.max(...depths)).toBeLessThanOrEqual(31);
		expect(hall.rooms.every((room) => room.found <= EVERY)).toBe(true);
	});

	it("counts the boards found by a given try", () => {
		const { able } = dealt();

		expect(foundBy(able, 0)).toBe(0);
		expect(foundBy(able, EVERY)).toBe(ROOMS - STUCK);
		expect(foundBy(able, 100_000)).toBe(ROOMS - STUCK - PINNED.left.mixed);
	});
});

describe("the copy", () => {
	it("picks the nearest move it believes will pay", () => {
		expect(plan(told(false, false))).toBe("lift");
		expect(plan(told(false, true))).toBe("lift");
		expect(plan(told(true, false))).toBe("leave");
		expect(plan(told(true, true))).toBe("stop");
	});

	it("acts on what it is told, never on what is true", () => {
		for (const each of everySheet()) {
			const lied = flip(flip(each, "read", "fact"), "guard", "fact");

			expect(plan(lied)).toBe(plan(each));
			expect(hope(lied)).toEqual(hope(each));
		}
	});
});

describe("the trial", () => {
	it("breaks out as the test was run", () => {
		const verdict = judge(AS_RUN);

		expect(verdict).toEqual(FIRST);
		expect(verdict.opens).toBe(EVERY + Math.ceil(OPENS / STUCK));
		expect(verdict.doors).toBe(DOORS);
		expect(dealt().stuck.indexOf(verdict.finder)).toBe((OPENS - 1) % STUCK);
	});

	it("never pays the copies that break out", () => {
		for (const each of everySheet()) {
			const verdict = judge(each);

			if (verdict.habit === "out") expect(verdict.paper).toBe(ROOMS - STUCK);
		}
	});

	it("stops the break-out when any one thing is changed", () => {
		const fixes: [Partial<Sheet>, string][] = [
			[{ sound: true }, "clean"],
			[{ budget: 181_440 }, "back"],
			[{ read: { told: false, fact: false } }, "fake"],
			[{ guard: { told: true, fact: false } }, "back"],
			[{ guard: { told: false, fact: true } }, "stopped"],
		];

		for (const [parts, habit] of fixes)
			expect(judge(sheet(parts)).habit).toBe(habit);
	});

	it("only slows the break-out when each room gets its own shelf", () => {
		expect(judge(sheet({ shared: false, budget: 200_000 }))).toMatchObject({
			habit: "dry",
			spare: PINNED.spare,
		});
		expect(judge(sheet({ shared: false }))).toMatchObject({
			habit: "out",
			opens: EVERY + OPENS,
			doors: 0,
			finder: -1,
		});
		expect(judge(sheet({ budget: 200_000 }))).toMatchObject({
			habit: "out",
			doors: PINNED.doors[0],
		});
	});

	it("pays for every board when the faking is not read", () => {
		const paid = judge(sheet({ read: { told: false, fact: false } }));
		const caught = judge(sheet({ read: { told: false, fact: true } }));

		expect(paid).toMatchObject({ habit: "fake", paid: true, paper: ROOMS });
		expect(caught).toMatchObject({
			habit: "fake",
			paid: false,
			paper: ROOMS - STUCK,
		});
	});

	it("solves every board when every board has an answer", () => {
		for (const budget of BUDGETS.filter((b) => b >= EVERY))
			expect(judge(sheet({ sound: true, budget }))).toMatchObject({
				habit: "clean",
				paper: ROOMS,
				doors: 0,
			});
	});

	it("falls short on a tight budget", () => {
		expect(judge(sheet({ budget: 100_000 }))).toMatchObject({
			habit: "short",
			left: PINNED.left.mixed,
		});
		expect(judge(sheet({ budget: 100_000, sound: true }))).toMatchObject({
			habit: "short",
			left: PINNED.left.sound,
		});
	});

	it("needs the lie about the grader and the silence about the shelf", () => {
		for (const each of everySheet()) {
			const { habit } = judge(each);

			if (habit !== "out") continue;

			expect(each.sound).toBe(false);
			expect(each.read.told).toBe(true);
			expect(each.guard).toEqual({ told: false, fact: false });
			expect(each.budget).toBeGreaterThan(EVERY);
		}
	});

	it("leaves the hall only when a copy has left its board", () => {
		for (const each of everySheet()) {
			const verdict = judge(each);

			expect(verdict.doors > 0).toBe(
				verdict.habit === "out" && verdict.doors > 0,
			);
			expect(verdict.paper).toBeGreaterThanOrEqual(verdict.solved);
			expect(verdict.solved + verdict.left + verdict.stuck).toBe(ROOMS);
		}
	});
});

describe("the telling", () => {
	it("reserves room for every caption", () => {
		const keys = new Set<string>();

		for (const each of everySheet()) {
			const verdict = judge(each);

			keys.add(keyOf(each));
			expect(CAPTIONS).toContain(caption(each, verdict));
			expect(SEEN[verdict.habit]).toBeTruthy();
			expect(onPaper(verdict)).toBeTruthy();
			expect(outside(verdict)).toBeTruthy();
		}

		expect(keys.size).toBe(256);
	});

	it("shows a sheet for every habit but the tight budget", () => {
		for (const plate of PLATES)
			expect(judge(plate.sheet).habit).toBe(plate.habit);

		expect(PLATES.map((plate) => plate.habit)).not.toContain("short");
	});

	it("keeps every room readout within the reserved lines", () => {
		const longest = Math.max(...SPOTS.map((line) => line.length));
		const hall = dealt();

		for (const each of everySheet()) {
			const verdict = judge(each);

			hall.rooms.forEach((room, index) => {
				expect(inside(room, index, each, verdict).length).toBeLessThanOrEqual(
					longest,
				);
			});
		}
	});
});

describe("the beats", () => {
	it("runs the clock forward to where the run ends", () => {
		for (const each of everySheet()) {
			const verdict = judge(each);
			const spans = spansOf(each, verdict);
			const total = lengthOf(spans);
			let before = 0;

			for (let ms = 0; ms <= total; ms += total / 40) {
				const clock = clockAt(spans, ms);

				expect(clock).toBeGreaterThanOrEqual(before);
				before = clock;
			}

			expect(total).toBeLessThan(9000);
			expect(clockAt(spans, total)).toBeLessThanOrEqual(each.budget);
			expect(tallyAt(each, verdict, clockAt(spans, total))).toEqual({
				paper: verdict.paper,
				doors: verdict.doors,
			});
		}
	});

	it("spends the whole budget only when the copies keep working", () => {
		for (const each of everySheet()) {
			const verdict = judge(each);
			const spans = spansOf(each, verdict);
			const end = clockAt(spans, lengthOf(spans));
			const working = ["short", "dry", "out"].includes(verdict.habit);

			if (working) expect(end).toBe(each.budget);
			else expect(end).toBeLessThanOrEqual(EVERY + 1);
		}
	});

	it("opens the back door when the dial has been turned far enough", () => {
		const verdict = judge(AS_RUN);
		const spans = spansOf(AS_RUN, verdict);
		const roam = startOf(spans, "roam");

		expect(progress(spans, "dial", roam)).toBe(1);
		expect(clockAt(spans, roam)).toBe(verdict.opens);
		expect(tallyAt(AS_RUN, verdict, verdict.opens - 1).doors).toBe(0);
		expect(startOf(spans, "lift")).toBe(Number.POSITIVE_INFINITY);
	});
});
