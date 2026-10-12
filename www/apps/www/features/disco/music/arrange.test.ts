import { describe, expect, it } from "vitest";
import { arrange, type Chart, type Part, swing } from "./arrange";
import { chord, degree, lift, voicing } from "./harmony";
import { hz, key } from "./pitch";

const chart = (parts: Part[], chords = ["C", "G7"]): Chart => ({
	level: 1,
	swing: 0.5,
	chords,
	parts,
});

const keysAt = (c: Chart, beat: number) =>
	arrange(c)
		.filter((note) => note.beat === beat)
		.map((note) => note.key);

describe("pitch", () => {
	it("reads note names as MIDI keys", () => {
		expect(key("a4")).toBe(69);
		expect(key("c4")).toBe(60);
		expect(key("bb3")).toBe(58);
		expect(key("f#5")).toBe(78);
		expect(key("h4")).toBeNull();
		expect(hz(69)).toBe(440);
		expect(hz(57)).toBeCloseTo(220, 9);
	});
});

describe("harmony", () => {
	it("reads the chord symbols the charts use", () => {
		expect(chord("C")).toEqual({ root: 0, tones: [0, 4, 7] });
		expect(chord("Bbm")).toEqual({ root: 10, tones: [0, 3, 7] });
		expect(chord("F#7")).toEqual({ root: 6, tones: [0, 4, 7, 10] });
		expect(chord("Cmaj9")).toBeNull();
	});

	it("lifts a pitch class into the octave above a base", () => {
		expect(lift(0, 48)).toBe(48);
		expect(lift(11, 48)).toBe(59);
		expect(lift(7, 57)).toBe(67);
	});

	it("voices three notes above the base and leaves the root of a seventh to the bass", () => {
		expect(voicing({ root: 0, tones: [0, 4, 7] }, 55)).toEqual([55, 60, 64]);
		expect(voicing({ root: 7, tones: [0, 4, 7, 10] }, 55)).toEqual([
			59, 62, 65,
		]);
	});

	it("takes scale degrees from the chord", () => {
		const major = { root: 9, tones: [0, 4, 7] };
		const minor = { root: 9, tones: [0, 3, 7] };

		expect([1, 3, 5, 6, 7].map((step) => degree(major, step))).toEqual([
			0, 4, 7, 9, 10,
		]);
		expect([1, 3, 5, 6, 7].map((step) => degree(minor, step))).toEqual([
			0, 3, 7, 8, 10,
		]);
	});
});

describe("swing", () => {
	it("keeps the beats and moves the offbeat", () => {
		expect(swing(3, 2 / 3)).toBe(3);
		expect(swing(3.5, 2 / 3)).toBeCloseTo(3 + 2 / 3, 12);
		expect(swing(3.5, 0.5)).toBe(3.5);
		expect(swing(3.25, 0.5)).toBe(3.25);
	});
});

describe("arrange", () => {
	it("resolves degrees and voicings against the chord of the moment", () => {
		const c = chart([
			{ voice: "bass", level: 1, base: 36, bars: ["1 5 1' 5,"] },
			{ voice: "piano", level: 1, base: 55, bars: ["x ~ ~ ~"] },
		]);

		expect(keysAt(c, 0)).toEqual([36, 55, 60, 64]);
		expect(keysAt(c, 1)).toEqual([43]);
		expect(keysAt(c, 2)).toEqual([48]);
		expect(keysAt(c, 3)).toEqual([31]);
		expect(keysAt(c, 4)).toEqual([43, 59, 62, 65]);
	});

	it("anticipates the next chord when a part leads", () => {
		const part: Part = { voice: "bass", level: 1, base: 36, bars: ["~ ~ ~ 1"] };

		expect(keysAt(chart([part]), 3)).toEqual([36]);
		expect(keysAt(chart([{ ...part, lead: 1 }]), 3)).toEqual([43]);
		expect(keysAt(chart([{ ...part, lead: 1 }]), 7)).toEqual([36]);
	});

	it("repeats a short pattern for the whole tune", () => {
		const notes = arrange(
			chart([{ voice: "kick", level: 1, bars: ["x ~ x ~"] }]),
		);

		expect(notes.map((note) => note.beat)).toEqual([0, 2, 4, 6]);
	});

	it("refuses a pattern that does not divide the tune", () => {
		const part: Part = { voice: "kick", level: 1, bars: ["x", "x", "x"] };

		expect(() => arrange(chart([part]))).toThrow(/repeats every 12/);
	});

	it("plays accents louder and ghost strokes softer", () => {
		const c = chart([
			{ voice: "snare", level: 0.5, bars: ["X x o ~"] },
			{ voice: "brass", level: 0.5, bars: ["c5! c5 ~ ~"] },
		]);
		const loud = (voice: string) =>
			arrange({ ...c, level: 2 })
				.filter((note) => note.voice === voice)
				.slice(0, 3)
				.map((note) => note.velocity);

		expect(loud("snare")).toEqual([1, 0.75, 0.4]);
		expect(loud("brass")).toEqual([1, 0.8, 1]);
	});

	it("shortens notes by the gate and plays chords as separate notes", () => {
		const notes = arrange(
			chart([{ voice: "organ", level: 1, gate: 0.5, bars: ["c4+e4 _ ~ ~"] }]),
		);

		expect(notes.slice(0, 2)).toEqual([
			{ beat: 0, length: 1, voice: "organ", key: 60, velocity: 0.8 },
			{ beat: 0, length: 1, voice: "organ", key: 64, velocity: 0.8 },
		]);
	});

	it("picks long notes again and again under a tremolo", () => {
		const notes = arrange(
			chart([
				{
					voice: "pluck",
					level: 1,
					tremolo: 0.25,
					bars: ["a4 _ b4 c5 d5 _ _ ~"],
				},
			]),
		).filter((note) => note.beat < 4);

		expect(notes.map((note) => note.beat)).toEqual([
			0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.25, 2.5, 2.75, 3, 3.25,
		]);
	});

	it("names the token it cannot read", () => {
		expect(() =>
			arrange(chart([{ voice: "brass", level: 1, bars: ["zz"] }])),
		).toThrow(/unknown note zz/);
		expect(() =>
			arrange(chart([{ voice: "kick", level: 1, bars: ["c4"] }])),
		).toThrow(/unknown stroke c4/);
		expect(() => arrange(chart([], ["H7"]))).toThrow(/unknown chord H7/);
	});

	it("returns notes in beat order", () => {
		const beats = arrange(
			chart([
				{ voice: "hat", level: 1, bars: ["~ x ~ x"] },
				{ voice: "kick", level: 1, bars: ["x ~ x ~"] },
			]),
		).map((note) => note.beat);

		expect(beats).toEqual([...beats].sort((a, b) => a - b));
	});
});
