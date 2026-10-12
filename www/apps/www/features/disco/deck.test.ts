import { describe, expect, it } from "vitest";
import { choices, deal, joins, opening, remember, span } from "./deck";
import { FILMED_AT, filmed, films, range } from "./film";

describe("a dancer's file", () => {
	it("covers the whole film with moves laid end to end", () => {
		for (const id of films) {
			const { moves, seconds } = filmed(id);
			let frame = 0;

			for (const [first, length] of moves) {
				expect(first).toBe(frame);
				frame += length;
			}

			expect(frame / FILMED_AT).toBeCloseTo(seconds, 1);
		}
	});

	it("has a join table with one entry for every pair of moves", () => {
		for (const id of films)
			expect(filmed(id).joins).toHaveLength(filmed(id).moves.length ** 2);
	});

	it("starts with the entrance where the file marks one", () => {
		expect(opening("kenny")).toBe(23);
		expect(opening("josh")).toBe(0);
	});

	it("lists the five speeds, slowest to fastest", () => {
		for (const id of films) {
			expect(filmed(id).rates).toEqual([26, 28, 30, 32, 34]);
			expect(range(id)[0]).toBeCloseTo(26 / 30);
			expect(range(id)[1]).toBeCloseTo(34 / 30);
		}
	});
});

describe("dealing", () => {
	it("never deals the entrance, the same move twice running, or a forbidden join", () => {
		for (const id of films) {
			let from = opening(id);
			let dealt: number[] = [];
			let seed = 7;
			const chance = () => {
				seed = (seed * 1103515245 + 12345) % 2147483648;

				return seed / 2147483648;
			};

			for (let i = 0; i < 400; i++) {
				const next = deal(id, from, dealt, chance);

				expect(next).not.toBe(from);
				expect(next).not.toBe(filmed(id).enter);
				expect(joins(id, from, next)).toBe(true);
				dealt = remember(id, dealt, next);
				from = next;
			}
		}
	});

	it("goes through most of the deck before repeating", () => {
		let from = opening("amanda");
		let dealt: number[] = [];
		const seen = new Set<number>();
		let turn = 0;

		for (let i = 0; i < 24; i++) {
			const next = deal("amanda", from, dealt, () => (turn++ * 0.37) % 1);

			seen.add(next);
			dealt = remember("amanda", dealt, next);
			from = next;
		}

		expect(seen.size).toBeGreaterThanOrEqual(22);
	});

	it("always leaves somewhere to go", () => {
		for (const id of films)
			filmed(id).moves.forEach((_, move) => {
				expect(choices(id, move).length).toBeGreaterThan(0);
			});
	});
});

describe("dealing to a tune", () => {
	it("prefers moves that can be fitted, and still deals when none can", () => {
		const long = (move: number) => span("kenny", move).length > 200;
		let turn = 0;
		const chance = () => (turn++ * 0.31) % 1;

		for (let i = 0; i < 12; i++)
			expect(long(deal("kenny", 0, [], chance, long))).toBe(true);

		expect(deal("kenny", 0, [], chance, () => false)).not.toBe(0);
	});
});
