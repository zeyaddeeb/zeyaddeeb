import { describe, expect, it } from "vitest";
import {
	asleep,
	type Generation,
	type Limits,
	type Move,
	more,
	type Piece,
	percent,
	step,
} from "./piece";

const limits: Limits = {
	takeSeconds: 8,
	shortestTakeSeconds: 1.2,
	batch: 2,
	generations: 4,
	runs: 6,
	bands: 4,
};

const generation = (index: number): Generation => ({
	index,
	text: index ? `take ${index}` : "",
	likeness: 1 - index * 0.2,
	seconds: 2,
	spectrum: [0, 1, 2, 3],
});

const play = (...moves: Move[]) => moves.reduce<Piece>(step, asleep);

const arrive = (index: number): Move => ({
	type: "generation",
	generation: generation(index),
});

const started: Move[] = [
	{ type: "wake" },
	{ type: "open", limits, microphone: true },
	{ type: "listen" },
	{ type: "send" },
	{ type: "began" },
];

describe("a first run", () => {
	it("walks from asleep to running", () => {
		expect(play({ type: "wake" }).phase).toBe("waking");
		expect(
			play({ type: "wake" }, { type: "open", limits, microphone: true }).phase,
		).toBe("ready");
		expect(play(...started).phase).toBe("running");
	});

	it("cannot listen before the link is open", () => {
		expect(play({ type: "listen" }).phase).toBe("asleep");
		expect(play({ type: "wake" }, { type: "listen" }).phase).toBe("waking");
	});

	it("collects generations and rests when the batch ends", () => {
		const piece = play(...started, arrive(0), arrive(1), arrive(2), {
			type: "finished",
			reason: "batch",
		});

		expect(piece.generations.map((g) => g.index)).toEqual([0, 1, 2]);
		expect(piece.phase).toBe("rested");
		expect(more(piece)).toBe(true);
	});

	it("offers no more once the limit is reached or the run went silent", () => {
		const full = play(
			...started,
			arrive(0),
			arrive(1),
			arrive(2),
			arrive(3),
			arrive(4),
			{ type: "finished", reason: "batch" },
		);
		const silent = play(...started, arrive(0), {
			type: "finished",
			reason: "silence",
		});

		expect(more(full)).toBe(false);
		expect(more(silent)).toBe(false);
	});
});

describe("the cursor", () => {
	it("follows arrivals until something is heard, then follows playback", () => {
		const silent = play(...started, arrive(0), arrive(1));
		const audible = play(
			...started,
			arrive(0),
			{ type: "playing", generation: 0 },
			arrive(1),
			arrive(2),
		);

		expect(silent.cursor).toBe(1);
		expect(audible.cursor).toBe(0);
		expect(step(audible, { type: "playing", generation: 1 }).cursor).toBe(1);
	});

	it("stays where the visitor put it", () => {
		const piece = play(
			...started,
			arrive(0),
			arrive(1),
			arrive(2),
			{ type: "point", index: 1 },
			{ type: "playing", generation: 2 },
			arrive(3),
		);

		expect(piece.cursor).toBe(1);
		expect(piece.following).toBe(false);
		expect(piece.playing).toBe(2);
	});

	it("follows again when pointed at the newest generation", () => {
		const piece = play(
			...started,
			arrive(0),
			arrive(1),
			{ type: "point", index: 0 },
			{ type: "point", index: 9 },
		);

		expect(piece.cursor).toBe(1);
		expect(piece.following).toBe(true);
	});

	it("clears the playhead only for the generation that ended", () => {
		const piece = play(...started, arrive(0), arrive(1), {
			type: "playing",
			generation: 1,
		});

		expect(step(piece, { type: "played", generation: 0 }).playing).toBe(1);
		expect(step(piece, { type: "played", generation: 1 }).playing).toBeNull();
	});
});

describe("a second take", () => {
	const rested = play(...started, arrive(0), arrive(1), {
		type: "finished",
		reason: "batch",
	});

	it("ignores what the old run still sends while listening", () => {
		const piece = [
			{ type: "listen" } as Move,
			arrive(2),
			{ type: "finished", reason: "stopped" } as Move,
		].reduce(step, rested);

		expect(piece.phase).toBe("listening");
		expect(piece.generations).toHaveLength(2);
	});

	it("starts clean when the new run begins", () => {
		const piece = [
			{ type: "listen" } as Move,
			{ type: "send" } as Move,
			arrive(2),
			{ type: "began" } as Move,
			arrive(0),
		].reduce(step, rested);

		expect(piece.phase).toBe("running");
		expect(piece.generations.map((g) => g.index)).toEqual([0]);
		expect(piece.ending).toBeNull();
	});

	it("goes on from where it rested", () => {
		const piece = [{ type: "more" } as Move, arrive(2)].reduce(step, rested);

		expect(piece.phase).toBe("running");
		expect(piece.generations).toHaveLength(3);
	});

	it("returns to rest with a notice when the take is refused", () => {
		const piece = [
			{ type: "listen" } as Move,
			{ type: "send" } as Move,
			{ type: "error", message: "too short" } as Move,
		].reduce(step, rested);

		expect(piece.phase).toBe("rested");
		expect(piece.notice).toBe("too short");
		expect(piece.generations).toHaveLength(2);
	});
});

describe("listening without a microphone", () => {
	const tuned: Move[] = [
		{ type: "wake" },
		{ type: "open", limits, microphone: false },
		{
			type: "house",
			generations: [generation(0), generation(1), generation(2)],
		},
	];

	it("loads the recorded run and waits at its start", () => {
		const piece = play(...tuned);

		expect(piece.phase).toBe("ready");
		expect(piece.recorded).toBe(true);
		expect(piece.microphone).toBe(false);
		expect(piece.generations).toHaveLength(3);
		expect(piece.cursor).toBe(0);
	});

	it("follows playback of the recorded run", () => {
		const piece = play(...tuned, { type: "playing", generation: 2 });

		expect(piece.cursor).toBe(2);
		expect(piece.playing).toBe(2);
	});

	it("offers nothing to go on with", () => {
		expect(more(play(...tuned))).toBe(false);
	});

	it("can wake again to add the microphone, then starts clean", () => {
		const piece = play(
			...tuned,
			{ type: "wake" },
			{ type: "open", limits, microphone: true },
		);

		expect(piece.phase).toBe("ready");
		expect(piece.microphone).toBe(true);
		expect(piece.recorded).toBe(false);
		expect(piece.generations).toHaveLength(0);
	});

	it("is replaced by the visitor's own run", () => {
		const piece = play(
			...tuned,
			{ type: "wake" },
			{ type: "open", limits, microphone: true },
			{ type: "house", generations: [generation(0), generation(1)] },
			{ type: "listen" },
			{ type: "send" },
			{ type: "began" },
			arrive(0),
		);

		expect(piece.recorded).toBe(false);
		expect(piece.generations.map((g) => g.index)).toEqual([0]);
	});

	it("shows a notice when the recorded run is not ready", () => {
		const piece = play(
			{ type: "wake" },
			{ type: "open", limits, microphone: false },
			{ type: "error", message: "still being made" },
		);

		expect(piece.phase).toBe("ready");
		expect(piece.notice).toBe("still being made");
	});
});

describe("closing", () => {
	it("keeps what was made and can be woken again", () => {
		const piece = play(...started, arrive(0), {
			type: "close",
			notice: "the line dropped",
		});

		expect(piece.phase).toBe("closed");
		expect(piece.generations).toHaveLength(1);
		expect(step(piece, { type: "wake" }).phase).toBe("waking");
	});
});

describe("percent", () => {
	it("clamps likeness to a whole percentage", () => {
		expect(percent(0.364)).toBe(36);
		expect(percent(-0.03)).toBe(0);
		expect(percent(1.2)).toBe(100);
	});
});
