import { expect, describe as group, it } from "vitest";
import {
	caption,
	describe,
	percent,
	rgba,
	short,
	type Tally,
	verdict,
} from "./model";

const tally = (over: Partial<Tally>): Tally => ({
	terms: [],
	votes: [],
	fitting: 0,
	silent: 0,
	considered: 0,
	silentMass: 0,
	answeredMass: 0,
	unexplored: 0,
	...over,
});

group("model", () => {
	it("narrates the vote", () => {
		expect(
			caption(
				tally({
					terms: [1, 1, 2],
					fitting: 104,
					votes: [{ value: 3, share: 0.997, tone: 0 }],
				}),
			),
		).toBe("104 programs fit 1, 1, 2. 99.7% of their vote says 3.");
		expect(
			caption(
				tally({
					terms: [2, 3, 5, 7, 11],
					votes: [{ value: 0, share: 0.5, tone: 0 }],
				}),
			),
		).toContain("No rule up to 26 bits makes 2, 3, 5, 7, 11.");
		expect(
			caption(
				tally({
					terms: [2, 3, 5],
					fitting: 34,
					votes: [{ value: 5, share: 0.21, tone: 0 }],
				}),
			),
		).toContain("The vote is split");
	});

	it("keeps short shares inside a ledger cell", () => {
		expect(short(0.99999)).toBe("99.9%");
		expect(short(0.997)).toBe("99.7%");
		expect(short(0.42)).toBe("42%");
		expect(short(0.001)).toBe("<1%");
		expect(percent(0.99999)).toBe("over 99.9%");
	});

	it("describes the three kinds of program", () => {
		const base = {
			id: 0,
			x: 0,
			y: 0,
			w: 0,
			h: 0,
			bits: 15,
			tone: 0,
			share: 0.39,
		};

		expect(
			describe({
				...base,
				kind: "rule",
				rule: "+ a1 a2",
				seeds: [1],
				next: 13,
			}),
		).toBe("a(n) = a(n−1) + a(n−2), starting 1");
		expect(
			describe({ ...base, kind: "memo", rule: "", seeds: [2, 3], next: 0 }),
		).toBe("Remember 2, 3, then say 0");
		expect(
			verdict({
				...base,
				kind: "silent",
				rule: "first n n",
				seeds: [],
				next: null,
			}),
		).toBe("15 bits · never answered");
	});

	it("reads CSS hex colors as RGBA words", () => {
		expect(rgba("#e83025")).toBe(0xe83025ff);
		expect(rgba(" #fff ")).toBe(0xffffffff);
	});
});
