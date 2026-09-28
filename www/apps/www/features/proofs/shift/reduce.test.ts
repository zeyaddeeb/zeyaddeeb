import { describe, expect, it } from "vitest";
import type { AgentState, Envelope, Event, Overview } from "./protocol";
import { initial, reduce } from "./reduce";

const state: AgentState = {
	awakeSince: 0,
	episodes: 0,
	tokens: 0,
	frontier: 0,
	zeros: 0,
	missing: 0,
	contours: 0,
	predictions: 0,
	held: 0,
	broken: 0,
	verified: 0,
	letter: "",
	lastFront: "",
	arms: [],
	records: {
		closestGap: null,
		gueDistance: null,
		robinDigits: null,
		robinMargin: null,
		mertensX: null,
		mertensRatio: null,
		hassePrimes: null,
	},
	budget: { dayStart: 0, spent: 0, failures: 0 },
};

function overview(backlog: Envelope[] = []): Overview {
	return {
		about: {
			model: "Qwen/Qwen3.5-4B",
			tokensPerDay: 300000,
			lean: "v4.34.0",
			mathlib: "v4.34.0",
			calibration: [],
		},
		state,
		fronts: [],
		backlog,
		episodes: [],
		nodes: [],
		links: [],
		lemmas: [],
		strip: { frontier: 0, bins: [], recent: [], closest: [], probes: [] },
		watchers: 0,
	};
}

let seq = 0;
function at(event: Event): Envelope {
	seq += 1;
	return { ...event, seq, at: seq } as Envelope;
}

describe("the live shift", () => {
	it("replays the backlog into turns with streamed text and graded calls", () => {
		const live = initial(
			overview([
				at({ type: "wake", episode: 7, front: "line", arms: [] }),
				at({ type: "delta", turn: 0, channel: "think", text: "Gram " }),
				at({ type: "delta", turn: 0, channel: "think", text: "blocks." }),
				at({ type: "call", turn: 0, id: "a", tool: "line", args: { to: 100 } }),
				at({
					type: "outcome",
					turn: 0,
					id: "a",
					tool: "line",
					ok: true,
					summary: "29 zeros",
					verdict: {
						field: "missing",
						op: "=",
						value: 0,
						observed: 0,
						held: true,
					},
					data: { from: 9.7, to: 101.3, zeros: [14.13, 21.02] },
				}),
			]),
		);
		expect(live.mode).toBe("work");
		expect(live.episode).toBe(7);
		expect(live.turns).toHaveLength(1);
		expect(live.turns[0].think).toBe("Gram blocks.");
		expect(live.turns[0].calls[0].outcome?.verdict?.held).toBe(true);
		expect(live.scans).toEqual([
			{
				kind: "line",
				from: 9.7,
				to: 101.3,
				sigma: null,
				zeros: [14.13, 21.02],
				found: null,
			},
		]);
	});

	it("ignores events it has already seen", () => {
		const first = at({ type: "delta", turn: 0, channel: "say", text: "once" });
		const live = reduce(initial(overview([first])), first);
		expect(live.turns[0].say).toBe("once");
	});

	it("retracts a turn the model has to retry", () => {
		let live = initial(overview());
		live = reduce(
			live,
			at({ type: "delta", turn: 2, channel: "think", text: "half a th" }),
		);
		live = reduce(live, at({ type: "retry", turn: 2 }));
		expect(live.turns[0].think).toBe("");
	});

	it("starts a fresh page for sleep and for each new episode", () => {
		let live = initial(overview());
		live = reduce(
			live,
			at({ type: "delta", turn: 0, channel: "say", text: "work" }),
		);
		live = reduce(live, at({ type: "sleep", after: 4 }));
		expect(live.mode).toBe("sleep");
		expect(live.turns).toEqual([]);
		live = reduce(
			live,
			at({ type: "wake", episode: 5, front: "divisors", arms: [] }),
		);
		expect(live.front).toBe("divisors");
	});

	it("restarts the search tree when a new statement opens", () => {
		let live = initial(overview());
		const step = {
			ok: true,
			goals: 1,
			goal: "⊢ 0 < x",
			error: null,
			source: "automation" as const,
		};
		live = reduce(
			live,
			at({
				type: "search",
				step: { ...step, id: 0, parent: null, tactic: "" },
			}),
		);
		live = reduce(
			live,
			at({
				type: "search",
				step: { ...step, id: 1, parent: 0, tactic: "simp" },
			}),
		);
		live = reduce(
			live,
			at({
				type: "search",
				step: { ...step, id: 0, parent: null, tactic: "" },
			}),
		);
		expect(live.search).toHaveLength(1);
	});

	it("keeps the newest episode first without duplicates", () => {
		const episode = {
			number: 3,
			front: "line",
			objective: "",
			prediction: "",
			summary: "done",
			next: "",
			reward: 0.2,
			held: 1,
			broken: 0,
			verified: 0,
			turns: 4,
			tokens: 900,
			started: 0,
			ended: 1,
		};
		let live = initial({
			...overview(),
			episodes: [{ ...episode, number: 2 }],
		});
		live = reduce(live, at({ type: "concluded", episode }));
		live = reduce(live, at({ type: "concluded", episode }));
		expect(live.episodes.map((e) => e.number)).toEqual([3, 2]);
	});
});
