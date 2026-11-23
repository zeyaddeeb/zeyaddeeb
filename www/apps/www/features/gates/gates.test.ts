import { describe, expect, it } from "vitest";
import { depths, draw, inputLabels } from "./draw";
import { count, ladder, limit, share, span, standing } from "./ladder";
import { proofNameSchema } from "./proof-name";
import type { Circuit, Study } from "./protocol";

const majority: Circuit = {
	inputs: 3,
	gates: [
		{ a: 0, b: 1, op: "xor" },
		{ a: 0, b: 2, op: "xor" },
		{ a: 3, b: 4, op: "and" },
		{ a: 0, b: 5, op: "xor" },
	],
	output: { kind: "node", node: 6, negated: false },
};

function study(overrides: Partial<Study>): Study {
	return {
		id: "majority-3",
		family: "majority",
		title: "Majority",
		rule: "More inputs are on than off.",
		purpose: null,
		inputs: 3,
		table: "e8",
		lower: 4,
		size: 4,
		circuit: majority,
		limitSeconds: 60,
		proof: "3-e8-3",
		known: { id: "majority-3", size: 4, source: "Kulikov, DATE 2018" },
		rungs: [
			{
				at: 0,
				gates: 1,
				verdict: "no",
				lemmas: 5,
				bytes: 1,
				millis: 2,
				checkMillis: 0,
				limitSeconds: 60,
				reason: null,
				cuts: [],
			},
			{
				at: 0,
				gates: 2,
				verdict: "no",
				lemmas: 95,
				bytes: 1,
				millis: 1,
				checkMillis: 0,
				limitSeconds: 60,
				reason: null,
				cuts: [],
			},
			{
				at: 0,
				gates: 3,
				verdict: "no",
				lemmas: 789,
				bytes: 1,
				millis: 4,
				checkMillis: 0,
				limitSeconds: 60,
				reason: null,
				cuts: [],
			},
			{
				at: 0,
				gates: 4,
				verdict: "yes",
				lemmas: 0,
				bytes: 0,
				millis: 6,
				checkMillis: 0,
				limitSeconds: 60,
				reason: null,
				cuts: [],
			},
		],
		...overrides,
	};
}

describe("drawing a circuit", () => {
	it("puts each gate one row below its deepest input", () => {
		expect(depths(majority)).toEqual([0, 0, 0, 1, 1, 2, 3]);
	});

	it("inverts the right wire of a gate that negates an input", () => {
		const drawing = draw({
			inputs: 2,
			gates: [{ a: 0, b: 1, op: "andNot" }],
			output: { kind: "node", node: 2, negated: true },
		});

		expect(drawing.wires).toEqual([
			{ from: 0, to: 2, inverted: false },
			{ from: 1, to: 2, inverted: true },
		]);
		expect(drawing.output).toEqual({ node: 2, inverted: true });
	});

	it("keeps every node inside the picture", () => {
		const drawing = draw(majority);

		for (const node of drawing.nodes) {
			expect(node.x).toBeGreaterThanOrEqual(0);
			expect(node.x).toBeLessThanOrEqual(drawing.width);
			expect(node.y).toBeLessThan(drawing.height);
		}
	});

	it("names graph inputs by their edges", () => {
		expect(inputLabels("triangle", 6)).toEqual([
			"ab",
			"ac",
			"ad",
			"bc",
			"bd",
			"cd",
		]);
		expect(inputLabels("parity", 3)).toEqual(["x1", "x2", "x3"]);
	});
});

describe("the ladder", () => {
	it("climbs from one gate to the answer", () => {
		const rungs = ladder(study({}), null, 0);

		expect(rungs.map((r) => r.state)).toEqual(["no", "no", "no", "yes"]);
		expect(rungs[2]?.kept).toBe(true);
		expect(rungs[1]?.kept).toBe(false);
	});

	it("shows the rung being asked with its live count", () => {
		const rungs = ladder(
			study({ size: null, lower: 4, rungs: study({}).rungs.slice(0, 3) }),
			{
				id: "majority-3",
				gates: 4,
				since: 1_000,
				limitSeconds: 600,
				lemmas: 1234,
				note: null,
			},
			61_000,
		);

		expect(rungs.at(-1)).toMatchObject({
			gates: 4,
			state: "asking",
			lemmas: 1234,
		});
		expect(rungs.at(-1)?.note).toBe("1,234 lemmas so far, 1 min of 10 min");
	});

	it("keeps the last word on a rung that was retried", () => {
		const rungs = ladder(
			study({
				size: null,
				lower: 2,
				rungs: [
					{
						at: 0,
						gates: 1,
						verdict: "open",
						lemmas: 0,
						bytes: 0,
						millis: 60_000,
						checkMillis: 0,
						limitSeconds: 60,
						reason: "no answer",
						cuts: [],
					},
					{
						at: 1,
						gates: 1,
						verdict: "no",
						lemmas: 40,
						bytes: 1,
						millis: 70_000,
						checkMillis: 0,
						limitSeconds: 600,
						reason: null,
						cuts: [],
					},
				],
			}),
			null,
			0,
		);

		expect(rungs[0]?.state).toBe("no");
	});

	it("reads a settled size against the published one", () => {
		expect(standing(study({}))).toEqual({
			kind: "settled",
			size: 4,
			matches: true,
		});
		expect(standing(study({ size: null, lower: 7, known: null }))).toEqual({
			kind: "bounded",
			lower: 7,
		});
	});
});

describe("formatting", () => {
	it("scales lemma counts on a log axis", () => {
		expect(share(0)).toBe(0);
		expect(share(999_999_999)).toBeCloseTo(1, 5);
		expect(share(1_000)).toBeCloseTo(3 / 9, 2);
	});

	it("writes durations and counts plainly", () => {
		expect(span(4)).toBe("4 ms");
		expect(span(3_100)).toBe("3.1 s");
		expect(span(600_000)).toBe("10 min");
		expect(limit(36_000)).toBe("10 h");
		expect(count(1009555)).toBe("1,009,555");
	});
});

describe("proof names", () => {
	it("accepts only certificate files", () => {
		expect(
			proofNameSchema.safeParse("6-0123456789abcdef-11.lrat").success,
		).toBe(true);
		expect(proofNameSchema.safeParse("3-e8-3.cnf").success).toBe(true);
		expect(proofNameSchema.safeParse("../record.json").success).toBe(false);
		expect(proofNameSchema.safeParse("3-E8-3.cnf").success).toBe(false);
	});
});
