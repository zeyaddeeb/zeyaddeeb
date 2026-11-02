import { describe, expect, it } from "vitest";
import {
	agreement,
	DIALS,
	dot,
	FIG_5A,
	FIG_5C,
	fromBase,
	ORDER,
	pin,
	striped,
} from "./card";

describe("Feynman's cards", () => {
	it("keeps dots ninety degrees apart opposite", () => {
		for (const card of ORDER)
			for (let dial = 0; dial < DIALS; dial++)
				expect(dot(card, dial)).not.toBe(dot(card, dial + 3));
	});

	it("caps every card at two thirds at thirty degrees", () => {
		const best = Math.max(...ORDER.map((card) => agreement(card, 1)));

		expect(best).toBeCloseTo(2 / 3, 12);
		expect(agreement(FIG_5A, 1)).toBeCloseTo(2 / 3, 12);
		expect(agreement(FIG_5C, 1)).toBe(0);
		expect(striped(FIG_5C)).toBe(true);
		expect(ORDER.filter(striped)).toEqual([5, 2]);
	});

	it("lists the half cards in rotation order", () => {
		const halves = ORDER.slice(0, 6);

		halves.forEach((card, i) => {
			const next = halves[(i + 1) % 6] ?? card;

			for (let dial = 0; dial < DIALS; dial++)
				expect(dot(next, dial + 1)).toBe(dot(card, dial));
		});
	});

	it("matches Figure 5a: black at 0 and 30 degrees, white at 60", () => {
		expect([dot(FIG_5A, 0), dot(FIG_5A, 1), dot(FIG_5A, 2)]).toEqual([
			true,
			true,
			false,
		]);
	});

	it("pins a dot through its base", () => {
		for (let dial = 0; dial < DIALS; dial++)
			for (const black of [true, false]) {
				const base: [boolean, boolean, boolean] = [false, true, false];

				pin(base, dial, black);
				expect(dot(fromBase(base), dial)).toBe(black);
			}
	});
});
