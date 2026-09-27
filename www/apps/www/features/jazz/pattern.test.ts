import { describe, expect, it } from "vitest";
import { cycle, PatternError, parse, period } from "./pattern";

const at = (source: string, bar = 0) =>
	cycle(parse(source), bar).map((h) => [
		h.value,
		round(h.begin - bar),
		round(h.end - bar),
	]);

const round = (x: number) => Math.round(x * 1e9) / 1e9;

describe("mini-notation", () => {
	it("divides a cycle evenly", () => {
		expect(at("a b c d")).toEqual([
			["a", 0, 0.25],
			["b", 0.25, 0.5],
			["c", 0.5, 0.75],
			["d", 0.75, 1],
		]);
	});

	it("skips rests and subdivides brackets", () => {
		expect(at("a ~ [b c]")).toEqual([
			["a", 0, round(1 / 3)],
			["b", round(2 / 3), round(5 / 6)],
			["c", round(5 / 6), 1],
		]);
	});

	it("alternates one option per bar", () => {
		expect(at("<a b c>", 0)).toEqual([["a", 0, 1]]);
		expect(at("<a b c>", 1)).toEqual([["b", 0, 1]]);
		expect(at("<a b c>", 5)).toEqual([["c", 0, 1]]);
	});

	it("advances nested alternation only when chosen", () => {
		const firsts = [0, 1, 2, 3].map((bar) => at("<a <b c>>", bar)[0][0]);
		expect(firsts).toEqual(["a", "b", "a", "c"]);
	});

	it("repeats with * and stretches with @ and _", () => {
		expect(at("a*2 b")).toEqual([
			["a", 0, 0.25],
			["a", 0.25, 0.5],
			["b", 0.5, 1],
		]);
		expect(at("a@3 b")).toEqual([
			["a", 0, 0.75],
			["b", 0.75, 1],
		]);
		expect(at("a _ _ b")).toEqual(at("a@3 b"));
	});

	it("replicates with !", () => {
		expect(at("a!3 b")).toEqual(at("a a a b"));
		expect(at("<a!2 b>", 1)).toEqual([["a", 0, 1]]);
		expect(at("<a!2 b>", 2)).toEqual([["b", 0, 1]]);
		expect(at("<[x x]!10 x ~>", 11)).toEqual([]);
	});

	it("stacks layers with commas", () => {
		expect(at("[a, b c]")).toEqual([
			["a", 0, 1],
			["b", 0, 0.5],
			["c", 0.5, 1],
		]);
	});

	it("reads slides without eating the closing bracket", () => {
		expect(at("<db5>d5 e5>", 0)).toEqual([["db5>d5", 0, 1]]);
	});

	it("gives each event its source span", () => {
		const [, second] = cycle(parse("c4 [eb4 g4]"), 0);
		expect(second.span).toEqual([4, 7]);
	});

	it("reports where it broke", () => {
		expect(() => parse("a [b c")).toThrow(PatternError);
		try {
			parse("a ] b");
		} catch (error) {
			expect((error as PatternError).at).toBe(2);
		}
	});

	it("knows how many bars before it repeats", () => {
		expect(period(parse("a b"))).toBe(1);
		expect(period(parse("<a b c> d"))).toBe(3);
		expect(period(parse("<a <b c>>"))).toBe(4);
	});
});
