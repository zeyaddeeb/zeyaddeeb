import { describe, expect, it } from "vitest";
import {
	type Beat,
	fitted,
	type Hold,
	LOCKED,
	locked,
	START,
	steer,
} from "./lock";

const FRAME = 1 / 60;
const FILMED_AT = 30;
const REEL = [26 / 30, 34 / 30] as const;

const steady =
	(bpm: number, from = 0) =>
	(t: number): Beat => ({ playing: true, bpm, beat: from + (t * bpm) / 60 });

function dance(moves: number[], music: (t: number) => Beat, seconds: number) {
	let hold: Hold = START;
	let move = 0;
	let frame = 0;
	let base = 0;
	let count = 0;
	const starts: number[] = [];
	const trace: { hold: Hold; music: Beat }[] = [];

	for (let t = 0; t < seconds; t += FRAME) {
		const now = music(t);
		const length = moves[move % moves.length];

		count = fitted(length / FILMED_AT, now.bpm, count, REEL);
		hold = steer(
			hold,
			{
				at: base + (frame / length) * count,
				perBeat: length / count,
				reach: REEL,
			},
			now,
			FRAME,
			FILMED_AT,
		);
		frame += hold.speed * FILMED_AT * FRAME;
		trace.push({ hold, music: now });

		if (frame >= length) {
			frame -= length;
			base += count;
			count = 0;
			move++;
			starts.push(now.beat);
		}
	}

	return { trace, starts };
}

const KENNY = [259, 270, 261, 262, 33, 387, 519, 129, 135, 260];
const LONG = KENNY.filter((length) => length > 120);

describe("fitted", () => {
	it("counts a move in whole beats of the tune", () => {
		expect(fitted(259 / 30, 103, 0, REEL)).toBe(15);
		expect(fitted(259 / 30, 138, 0, REEL)).toBe(20);
		expect(fitted(33 / 30, 103, 0, REEL)).toBe(2);
	});

	it("keeps its count while the film can still reach it", () => {
		expect(fitted(259 / 30, 106, 15, REEL)).toBe(15);
		expect(fitted(259 / 30, 124, 15, REEL)).toBe(18);
	});

	it("needs a speed inside 26 to 34 frames a second for any move over two beats", () => {
		for (let bpm = 60; bpm <= 240; bpm += 1)
			for (const length of KENNY) {
				const natural = ((length / FILMED_AT) * bpm) / 60;

				if (natural < 3.76) continue;

				const speed = natural / fitted(length / FILMED_AT, bpm, 0, REEL);

				expect(speed).toBeGreaterThanOrEqual(REEL[0]);
				expect(speed).toBeLessThanOrEqual(REEL[1]);
			}
	});
});

describe("steer", () => {
	it("runs film as filmed when nothing is playing", () => {
		const { trace } = dance(
			KENNY,
			() => ({ playing: false, bpm: 120, beat: 0 }),
			2,
		);

		expect(trace.at(-1)?.hold.speed).toBeCloseTo(1, 3);
	});

	it.each([103, 124, 138, 160, 184, 196])(
		"starts every move on a beat of %f music once it has found it",
		(bpm) => {
			const { starts, trace } = dance(LONG, steady(bpm, 0.37), 90);

			expect(starts.length).toBeGreaterThan(8);

			for (const beat of starts.slice(2))
				expect(Math.abs(beat - Math.round(beat))).toBeLessThan(LOCKED);

			const last = trace.at(-1);

			expect(last && locked(last.hold, last.music)).toBe(true);
		},
	);

	it("misses after a move too short to fit, and is back within two moves", () => {
		const { starts } = dance(KENNY, steady(124, 0.2), 120);
		const off = starts.map((beat) => Math.abs(beat - Math.round(beat)));
		const missed = off.filter((gap) => gap >= LOCKED).length;

		expect(missed).toBeGreaterThan(0);
		expect(missed).toBeLessThan(off.length * 0.35);

		off.slice(3).forEach((gap, i) => {
			if (gap >= LOCKED && off[i + 5] !== undefined)
				expect(Math.min(off[i + 4], off[i + 5])).toBeLessThan(LOCKED);
		});
	});

	it("never leaves 26 to 34 frames a second", () => {
		const { trace } = dance(KENNY, steady(138, 0.5), 60);

		for (const { hold } of trace) {
			expect(hold.speed).toBeGreaterThanOrEqual(REEL[0] - 1e-6);
			expect(hold.speed).toBeLessThanOrEqual(REEL[1] + 1e-6);
		}
	});

	it("never jerks the film: speed changes by under 4 percent a frame", () => {
		const jumpy = (t: number): Beat =>
			t < 20 ? steady(103)(t) : steady(124, 0.5)(t);
		const { trace } = dance(KENNY, jumpy, 40);

		trace.slice(1).forEach(({ hold }, i) => {
			expect(Math.abs(hold.speed - trace[i].hold.speed)).toBeLessThan(0.04);
		});
	});
});
