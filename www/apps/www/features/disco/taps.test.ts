import { describe, expect, it } from "vitest";
import { beat, type Tapped, tap } from "./taps";

const taps = (times: number[]) =>
	times.reduce<Tapped | null>((state, at) => tap(state, at), null);

describe("tapping a beat", () => {
	it("is silent until there are two taps", () => {
		expect(beat(null, 0).playing).toBe(false);
		expect(beat(taps([1]), 1.2).playing).toBe(false);
	});

	it("reads steady taps as their tempo", () => {
		const state = taps([0, 0.5, 1, 1.5, 2]);

		expect(beat(state, 2).bpm).toBeCloseTo(120);
		expect(beat(state, 2).beat).toBeCloseTo(4);
		expect(beat(state, 2.25).beat).toBeCloseTo(4.5);
	});

	it("keeps counting when a tap is missed", () => {
		const state = taps([0, 0.5, 1, 2, 2.5]);

		expect(beat(state, 2.5).bpm).toBeCloseTo(120);
		expect(beat(state, 2.5).beat).toBeCloseTo(5);
	});

	it("keeps going after the tapping stops", () => {
		const state = taps([0, 0.4, 0.8, 1.2]);

		expect(beat(state, 61.2).playing).toBe(true);
		expect(beat(state, 61.2).beat).toBeCloseTo(153);
	});

	it("starts over after a long pause", () => {
		const state = taps([0, 0.5, 1, 4, 4.3]);

		expect(beat(state, 4.3).bpm).toBeCloseTo(200);
		expect(beat(state, 4.3).beat).toBeCloseTo(1);
	});

	it("ignores a double hit", () => {
		expect(taps([0, 0.5, 0.52, 1])).toEqual(taps([0, 0.5, 1]));
	});

	it("follows a tempo change inside five taps", () => {
		const state = taps([0, 0.5, 1, 1.5, 1.8, 2.1, 2.4, 2.7, 3]);

		expect(beat(state, 3).bpm).toBeCloseTo(200);
	});
});
