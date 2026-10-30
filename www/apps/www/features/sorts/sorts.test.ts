import { describe, expect, it } from "vitest";
import { pages } from "./pages";
import {
	alphabet,
	contains,
	leftovers,
	read,
	settable,
	touches,
	widthOf,
} from "./sorts";

describe("sorts", () => {
	it("reads every letter of the alphabet back from its own sorts", () => {
		for (const [char, sorts] of Object.entries(alphabet))
			expect(read(sorts)).toBe(char);
	});

	it("turns a letter into another when one sort is knocked off", () => {
		expect(leftovers("h")).toEqual(["l", "n"]);
		expect(leftovers("b")).toEqual(["l", "o"]);
		expect(leftovers("d")).toEqual(["l", "o"]);
		expect(leftovers("a")).toEqual(["a stem", "o"]);
		expect(leftovers("m")).toEqual(["n", "n"]);
		expect(leftovers("w")).toEqual(["u", "u"]);
		expect(leftovers("y")).toEqual(["a stem", "u"]);
		expect(leftovers("t")).toEqual(["l", "a bar"]);
		expect(leftovers("i")).toEqual(["a dot", "a stem"]);
		expect(leftovers("o")).toEqual([]);
	});

	it("sets every line of every page with the kit alone", () => {
		for (const page of pages)
			for (const line of page) expect(settable(line), line).toBe(true);

		expect(settable("the end")).toBe(false);
	});

	it("measures letters by their widest sort", () => {
		expect(widthOf("l")).toBe(1);
		expect(widthOf("o")).toBe(3);
		expect(widthOf("m")).toBe(5);
	});

	it("lets a shot pass through the hole of a ring and under an arch", () => {
		const ring = { kind: "ring" as const, rot: 0, x: 0, y: 0 };
		const arch = { kind: "arch" as const, rot: 0, x: 0, y: 0 };
		const cup = { kind: "arch" as const, rot: 2, x: 0, y: 0 };

		expect(contains(ring, 1.5, 1.5)).toBe(false);
		expect(contains(ring, 1.5, 0.2)).toBe(true);
		expect(contains(arch, 1.5, 2.5)).toBe(false);
		expect(contains(arch, 1.5, 0.2)).toBe(true);
		expect(contains(arch, 0.5, 2.8)).toBe(true);
		expect(contains(cup, 1.5, 0.5)).toBe(false);
		expect(contains(cup, 1.5, 2.8)).toBe(true);
		expect(contains(cup, 0.5, 0.2)).toBe(true);
	});

	it("opens a turned arch the way a c opens", () => {
		const c = { kind: "arch" as const, rot: 3, x: 0, y: 0 };

		expect(contains(c, 2.5, 1.5)).toBe(false);
		expect(contains(c, 0.2, 1.5)).toBe(true);
		expect(contains(c, 2.5, 0.5)).toBe(true);
	});

	it("touches only when the shapes overlap, not their boxes", () => {
		const ring = { kind: "ring" as const, rot: 0, x: 0, y: 0 };
		const inHole = { kind: "dot" as const, rot: 0, x: 1, y: 1 };
		const onRim = { kind: "dot" as const, rot: 0, x: 1, y: 2.4 };
		const corner = { kind: "dot" as const, rot: 0, x: 2.5, y: 2.5 };

		expect(touches(inHole, ring)).toBe(false);
		expect(touches(onRim, ring)).toBe(true);
		expect(touches(corner, ring)).toBe(false);
	});
});
