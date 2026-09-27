import { describe, expect, it } from "vitest";
import {
	chord,
	midi,
	noteName,
	pitch,
	ratioLabel,
	swing,
	voicing,
} from "./music";
import { compile, compileAll, notes, type Score } from "./score";

const score = (code: Partial<Score["code"]>, ratio = 1): Score => ({
	tempo: 120,
	swing: ratio,
	code: {
		chords: "",
		cornet: "",
		clarinet: "",
		trombone: "",
		piano: "",
		banjo: "",
		...code,
	},
	muted: [],
});

describe("music", () => {
	it("reads note names", () => {
		expect(midi("c4")).toBe(60);
		expect(midi("bb4")).toBe(70);
		expect(midi("f#2")).toBe(42);
		expect(noteName(70)).toBe("bb4");
		expect(pitch("db5>d5")).toEqual({ from: 73, to: 74 });
		expect(pitch("h4")).toBeNull();
	});

	it("voices chords above a floor", () => {
		const bb7 = chord("Bb7");
		expect(bb7?.root).toBe(10);
		expect(voicing(bb7!, 57)).toEqual([58, 62, 65, 68]);
		expect(chord("Hm")).toBeNull();
	});

	it("swings the second eighth of every beat", () => {
		expect(swing(0.125, 1)).toBe(0.125);
		expect(swing(0.125, 2)).toBeCloseTo(1 / 6);
		expect(swing(0.25, 2)).toBeCloseTo(0.25);
		expect(swing(1.375, 3)).toBeCloseTo(1.25 + 0.1875);
		expect(ratioLabel(2)).toBe("2:1");
		expect(ratioLabel(1.5)).toBe("3:2");
	});
});

describe("score", () => {
	it("points at the word that doesn't belong", () => {
		expect(compile("cornet", "bb4 x").problem).toMatchObject({ at: 4 });
		expect(compile("chords", "<Bb7 x>").problem).toMatchObject({ at: 5 });
		expect(compile("banjo", "x ~ x x").problem).toBeNull();
	});

	it("reads chords under the rhythm section", () => {
		const compiled = compileAll(
			score({ chords: "<Bb7 Eb7>", banjo: "x", piano: "1 x" }),
		);
		expect(notes(compiled, "banjo", 1, 1)[0].keys).toEqual([55, 58, 61, 63]);
		expect(notes(compiled, "piano", 0, 1).map((n) => n.keys)).toEqual([
			[46],
			[58, 62, 65, 68],
		]);
	});

	it("moves off-beats late when it swings", () => {
		const compiled = compileAll(score({ cornet: "c5 d5 e5 f5 g5 a5 b5 c6" }));
		const [, second] = notes(compiled, "cornet", 0, 2);
		expect(second.onset).toBeCloseTo(1 / 6);
		expect(second.begin).toBeCloseTo(1 / 8);
	});
});
