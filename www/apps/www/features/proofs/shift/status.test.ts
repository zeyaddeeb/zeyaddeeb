import { describe, expect, it } from "vitest";
import type { Live } from "./reduce";
import { activity, plan } from "./status";

const base = {
	seq: 0,
	mode: "work",
	episode: 3,
	front: "line",
	arms: [],
	phase: null,
	turns: [],
	search: [],
	scans: [],
	trouble: null,
	nodes: {},
	links: [],
	episodes: [],
	lemmas: [],
} as unknown as Live;

describe("what the agent is doing", () => {
	it("counts down a rest", () => {
		const live = {
			...base,
			phase: { phase: "rest", seconds: 60, reason: null, at: 0 },
		} as Live;
		expect(activity(live, 30_000)).toBe(
			"Resting between episodes. Back in 0:30.",
		);
	});

	it("names the tool that is running", () => {
		const live = {
			...base,
			turns: [
				{
					index: 0,
					think: "",
					say: "",
					calls: [{ id: "a", tool: "contour", args: {}, outcome: null }],
				},
			],
		} as Live;
		expect(activity(live, 0)).toBe("Search off the line…");
	});

	it("tells thinking from writing", () => {
		const thinking = {
			...base,
			turns: [{ index: 0, think: "hm", say: "", calls: [] }],
		} as Live;
		const writing = {
			...base,
			turns: [{ index: 0, think: "hm", say: "So", calls: [] }],
		} as Live;
		expect(activity(thinking, 0)).toBe("Thinking…");
		expect(activity(writing, 0)).toBe("Writing…");
	});

	it("finds the plan once it is accepted", () => {
		const live = {
			...base,
			turns: [
				{
					index: 0,
					think: "",
					say: "",
					calls: [
						{
							id: "p",
							tool: "plan",
							args: { objective: "Climb", prediction: "Nothing missing" },
							outcome: {
								ok: true,
								summary: "Planned.",
								verdict: null,
								data: null,
							},
						},
					],
				},
			],
		} as Live;
		expect(plan(live)).toEqual({
			objective: "Climb",
			prediction: "Nothing missing",
		});
		expect(plan(base)).toBeNull();
	});
});
