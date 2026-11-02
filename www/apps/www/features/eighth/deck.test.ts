import { describe, expect, it } from "vitest";
import { striped } from "./card";
import {
	adjust,
	cost,
	type Deck,
	draw,
	negativeShare,
	PRESETS,
	predictions,
	START,
	total,
	valid,
} from "./deck";
import { NATURE } from "./nature";
import { seeded } from "./seeded";

const preset = (id: string) => PRESETS.find((p) => p.id === id)?.deck ?? START;

describe("decks", () => {
	it("starts on Feynman's own card at the classical ceiling", () => {
		expect(predictions(START)).toEqual([1, 2 / 3, 1 / 3, 0]);
	});

	it("reaches nature only with minus one eighth", () => {
		const deck = preset("nature");

		expect(total(deck)).toBe(16);
		expect(negativeShare(deck)).toBeCloseTo(2 / 20, 12);
		expect(cost(deck)).toBeCloseTo(25 / 16, 12);

		predictions(deck).forEach((p, i) => {
			expect(p).toBeCloseTo(NATURE[i] ?? 0, 12);
		});
	});

	it("never passes two thirds without a negative count", () => {
		const random = seeded(7);

		for (let i = 0; i < 2000; i++) {
			const deck: Deck = Array.from({ length: 8 }, () =>
				Math.floor(random() * 5),
			);

			if (!valid(deck)) continue;

			expect(predictions(deck)[1] ?? 0).toBeLessThanOrEqual(2 / 3 + 1e-12);
		}
	});

	it("rejects empty or negative totals and clamps counts", () => {
		expect(valid(Array(8).fill(0))).toBe(false);
		expect(valid([-1, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
		expect(adjust(START, 3, 20)[3]).toBe(9);
		expect(adjust(START, 2, -20)[2]).toBe(-9);
	});

	it("draws anti-cards with a minus sign", () => {
		const deck = preset("nature");
		const random = seeded(3);
		let anti = 0;

		for (let i = 0; i < 20000; i++) {
			const { card, sign } = draw(deck, random);

			expect(sign < 0).toBe(striped(card));
			if (sign < 0) anti++;
		}

		expect(anti / 20000).toBeCloseTo(0.1, 2);
	});
});
