import { describe, expect, it } from "vitest";
import { rest, steps, times } from "./notation";

describe("steps", () => {
	it("divides each bar evenly by its steps", () => {
		expect(steps(["c4 d4 e4 f4", "g4 a4"])).toEqual([
			{ begin: 0, length: 1, token: "c4" },
			{ begin: 1, length: 1, token: "d4" },
			{ begin: 2, length: 1, token: "e4" },
			{ begin: 3, length: 1, token: "f4" },
			{ begin: 4, length: 2, token: "g4" },
			{ begin: 6, length: 2, token: "a4" },
		]);
	});

	it("drops rests and lengthens held notes, across bar lines too", () => {
		expect(steps(["c4 _ ~ d4", "_ _ ~ ~"])).toEqual([
			{ begin: 0, length: 2, token: "c4" },
			{ begin: 3, length: 3, token: "d4" },
		]);
	});

	it("ties a hold at the start to the note that ends the repeat", () => {
		expect(steps(["_ _ ~ ~ ~ ~ c4 _"])).toEqual([
			{ begin: 3, length: 2, token: "c4" },
		]);
	});

	it("writes a whole bar with a single step", () => {
		expect(steps(["~", "x", "~"])).toEqual([
			{ begin: 4, length: 4, token: "x" },
		]);
	});

	it("rejects a miscounted bar", () => {
		expect(() => steps(["c4 d4 e4 f4 g4 a4 b4"])).toThrow(/7 steps/);
	});

	it("rejects a hold with nothing before it", () => {
		expect(() => steps(["c4 ~ _ ~"])).toThrow(/hold/);
		expect(() => steps(["_ ~ c4 ~"])).toThrow(/repeat/);
	});
});

describe("helpers", () => {
	it("repeats bars and writes silent ones", () => {
		expect(times(2, ["a", "b"])).toEqual(["a", "b", "a", "b"]);
		expect(steps(rest(3))).toEqual([]);
	});
});
