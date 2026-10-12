import { describe, expect, it } from "vitest";
import {
	type Anchor,
	advance,
	beatAt,
	begin,
	between,
	clampRate,
	type Hit,
	latest,
	position,
	retime,
	type Transport,
	timeAt,
	trim,
} from "./schedule";
import { score } from "./score";
import { tunes } from "./tunes";

interface Event {
	beat: number;
	name: string;
}

interface Heard {
	when: number;
	beat: number;
}

const loop = 8;
const events: Event[] = [0, 0, 0.5, 1.5, 2, 3.999, 4, 6.25, 7.75].map(
	(beat, i) => ({ beat, name: `e${i}` }),
);

function random(seed: number) {
	let state = seed;

	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;

		return state / 2 ** 32;
	};
}

function expected(from: number, to: number): string[] {
	const out: string[] = [];

	for (let turn = 0; turn * loop < to; turn++)
		for (const event of events) {
			const beat = turn * loop + event.beat;

			if (beat >= from && beat < to) out.push(`${turn}:${event.name}`);
		}

	return out;
}

const label = (hit: Hit<Event>) =>
	`${Math.floor(hit.beat / loop)}:${hit.event.name}`;

describe("anchor", () => {
	const anchor: Anchor = { time: 12.5, beat: 37, bpm: 138 };

	it("maps time to beats at bpm / 60 and back", () => {
		expect(beatAt(anchor, 12.5)).toBe(37);
		expect(beatAt(anchor, 13.5) - beatAt(anchor, 12.5)).toBeCloseTo(138 / 60);

		for (const beat of [37, 40.25, 512.75])
			expect(beatAt(anchor, timeAt(anchor, beat))).toBeCloseTo(beat, 9);
	});

	it("clamps the rate to half speed and one and a half", () => {
		expect(clampRate(0.2)).toBe(0.5);
		expect(clampRate(0.73)).toBe(0.73);
		expect(clampRate(9)).toBe(1.5);
		expect(clampRate(Number.NaN)).toBe(1);
	});
});

describe("between", () => {
	it("takes the start of a window and leaves its end for the next", () => {
		expect(between(events, loop, 0, 0.5).map(label)).toEqual(["0:e0", "0:e1"]);
		expect(between(events, loop, 0.5, 2).map(label)).toEqual(["0:e2", "0:e3"]);
		expect(between(events, loop, 2, 2).map(label)).toEqual([]);
	});

	it("counts beats on from the loop seam", () => {
		const hits = between(events, loop, 7, 9);

		expect(hits.map(label)).toEqual(["0:e8", "1:e0", "1:e1", "1:e2"]);
		expect(hits.map((hit) => hit.beat)).toEqual([7.75, 8, 8, 8.5]);
	});

	it("spans several loops in one window", () => {
		expect(between(events, loop, 3, 30).map(label)).toEqual(expected(3, 30));
	});

	it("returns every event exactly once across consecutive windows", () => {
		const next = random(7);
		const seen: string[] = [];
		let from = 0;

		while (from < 400) {
			const to = from + next() * 3.3;

			seen.push(...between(events, loop, from, to).map(label));
			from = to;
		}

		expect(seen).toEqual(expected(0, from));
	});

	it("keeps real tunes whole when the windows are swung fractions", () => {
		for (const t of tunes) {
			const notes = score(t.id);
			const next = random(t.bpm);
			let count = 0;
			let from = 0;

			while (from < t.beats * 3) {
				const to = Math.min(t.beats * 3, from + next() * 0.7);

				count += between(notes, t.beats, from, to).length;
				from = to;
			}

			expect(count, t.id).toBe(notes.length * 3);
		}
	});
});

describe("transport", () => {
	it("starts at beat zero and never reports a negative beat", () => {
		const transport = begin(10, 120);

		expect(position(transport, 9.9)).toEqual({ beat: 0, bpm: 120 });
		expect(position(transport, 10.5)).toEqual({ beat: 1, bpm: 120 });
	});

	it("changes tempo at the scheduling horizon, not before it", () => {
		const scheduled = advance(begin(0, 120), 0.5);
		const faster = retime(scheduled, 180);

		expect(scheduled.scheduled).toBe(1);
		expect(latest(faster)).toEqual({ time: 0.5, beat: 1, bpm: 180 });
		expect(position(faster, 0.25)).toEqual({ beat: 0.5, bpm: 120 });
		expect(position(faster, 1.5)).toEqual({ beat: 4, bpm: 180 });
	});

	it("is continuous across a rate change and takes the new slope after it", () => {
		const transport = retime(advance(begin(3, 196), 3.37), 196 * 0.61);
		const at = latest(transport).time;
		const before = position(transport, at - 1e-7);
		const after = position(transport, at + 1e-7);

		expect(after.beat - before.beat).toBeLessThan(1e-6);
		expect(after.beat).toBeGreaterThanOrEqual(before.beat);
		expect(before.bpm).toBe(196);
		expect(after.bpm).toBe(196 * 0.61);
		expect(
			position(transport, at + 1).beat - position(transport, at).beat,
		).toBeCloseTo((196 * 0.61) / 60, 9);
	});

	it("keeps one anchor while a slider is dragged between ticks", () => {
		let transport = advance(begin(0, 100), 0.12);

		for (const bpm of [101, 104, 110, 125, 150])
			transport = retime(transport, bpm);

		expect(transport.anchors).toHaveLength(2);
		expect(latest(transport)).toEqual({ time: 0.12, beat: 0.2, bpm: 150 });
		expect(retime(transport, 150)).toBe(transport);
		expect(retime(begin(1, 100), 140).anchors).toEqual([
			{ time: 1, beat: 0, bpm: 140 },
		]);
	});

	it("forgets anchors only once nothing they timed can still be heard", () => {
		let transport = advance(begin(0, 120), 1);

		transport = advance(retime(transport, 60), 2);
		transport = advance(retime(transport, 90), 3);

		expect(trim(transport, 0.5).anchors).toHaveLength(3);
		expect(trim(transport, 1.5).anchors).toHaveLength(2);
		expect(trim(transport, 2.5).anchors).toHaveLength(1);
		expect(position(trim(transport, 1.5), 1.5)).toEqual(
			position(transport, 1.5),
		);
	});
});

describe("a dragged rate slider", () => {
	const base = 184;
	const latency = 0.043;
	const next = random(11);
	const scheduled: Hit<Event>[] = [];
	const starts: number[] = [];
	const pending: Heard[] = [];
	const errors: number[] = [];
	const clock: number[] = [];
	const times: number[] = [];
	let transport: Transport = begin(0.06, base);
	let last = 0;

	function tick(now: number) {
		const reached = advance(transport, now + 0.12);
		const anchor = latest(transport);

		for (const hit of between(
			events,
			loop,
			transport.scheduled,
			reached.scheduled,
		)) {
			scheduled.push(hit);
			starts.push(timeAt(anchor, hit.beat));
			pending.push({ when: timeAt(anchor, hit.beat), beat: hit.beat });
		}

		transport = trim(reached, now - latency);
	}

	function listen(now: number) {
		while (pending.length && pending[0].when <= now - latency) {
			const note = pending.shift() as Heard;

			errors.push(Math.abs(position(transport, note.when).beat - note.beat));
		}

		clock.push(position(transport, now - latency).beat);
		times.push(now);
	}

	for (let now = 0; now < 90; now += 0.004 + next() * 0.012) {
		listen(now);

		if (next() < 0.5)
			transport = retime(transport, base * clampRate(next() * 2));

		if (now - last >= 0.025) {
			tick(now);
			last = now;
		}
	}

	it("schedules every event exactly once, in order", () => {
		const until = transport.scheduled;

		expect(scheduled.map(label)).toEqual(expected(0, until));
		expect(scheduled.length).toBeGreaterThan(250);
	});

	it("never starts a note before the one written ahead of it", () => {
		for (let i = 1; i < starts.length; i++)
			expect(starts[i]).toBeGreaterThanOrEqual(starts[i - 1]);
	});

	it("reports the beat of each note at the moment the note sounds", () => {
		expect(errors.length).toBeGreaterThan(250);
		expect(Math.max(...errors)).toBeLessThan(1e-9);
	});

	it("never runs the clock backwards or faster than the top speed", () => {
		const top = (base * 1.5) / 60;

		for (let i = 1; i < clock.length; i++) {
			const moved = clock[i] - clock[i - 1];

			expect(moved).toBeGreaterThanOrEqual(0);
			expect(moved).toBeLessThanOrEqual(top * (times[i] - times[i - 1]) + 1e-9);
		}
	});

	it("keeps only the anchors still in use", () => {
		expect(transport.anchors.length).toBeLessThan(12);
	});
});
