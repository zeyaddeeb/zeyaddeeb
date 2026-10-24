import { describe, expect, it } from "vitest";
import { glance, lostAt, type Reader, Tape, write } from "./follow";
import { after, CUPS, pairOf, shuffleOrder, trail } from "./task";

function oracle(): Reader & { tokens: number[] } {
	const tokens: number[] = [];
	const ball = () => {
		let at = 0;

		for (const t of tokens) {
			at = t < CUPS ? t : after(at, t - CUPS);
		}

		return at;
	};

	return {
		tokens,
		push(token) {
			tokens.push(token);

			const probs = new Array(CUPS).fill(0);

			probs[ball()] = 1;

			return probs;
		},
		truncate(len) {
			tokens.length = Math.min(len, tokens.length);
		},
		len: () => tokens.length,
	};
}

const swaps = [pairOf(2, 4), pairOf(0, 1), pairOf(4, 0), pairOf(1, 3)];

describe("follow", () => {
	it("tracks the true ball with a perfect reader", () => {
		const truth = trail(2, swaps);

		expect(glance(new Tape(oracle()), 2, swaps).map((b) => b.pick)).toEqual(
			truth,
		);
		expect(
			write(new Tape(oracle()), 2, swaps, new Map()).map((n) => n.wrote),
		).toEqual(truth);
	});

	it("feeds only what changed", () => {
		const reader = oracle();
		const tape = new Tape(reader);

		write(tape, 2, swaps.slice(0, 3), new Map());

		const before = tape.pushes;

		write(tape, 2, swaps, new Map());

		expect(tape.pushes - before).toBe(2);
		expect(reader.len()).toBe(1 + 2 * swaps.length);
	});

	it("lets a forged note carry forward", () => {
		const tape = new Tape(oracle());
		const honest = write(tape, 2, swaps, new Map());
		const forged = write(tape, 2, swaps, new Map([[1, 3]]));

		expect(honest.map((n) => n.wrote)).toEqual([4, 4, 0, 0]);
		expect(forged.map((n) => n.wrote)).toEqual([4, 3, 3, 1]);
		expect(forged.map((n) => n.forged)).toEqual([false, true, false, false]);
		expect(write(tape, 2, swaps, new Map()).map((n) => n.wrote)).toEqual([
			4, 4, 0, 0,
		]);
	});

	it("starts over when the ball starts elsewhere", () => {
		const reader = oracle();
		const tape = new Tape(reader);

		glance(tape, 2, swaps);
		glance(tape, 1, swaps);

		expect(reader.tokens[0]).toBe(1);
		expect(reader.len()).toBe(1 + swaps.length);
	});

	it("names the first swap a watcher got wrong", () => {
		expect(lostAt([1, 2, 3], [1, 2, 3])).toBeNull();
		expect(lostAt([1, 4, 3], [1, 2, 3])).toBe(2);
	});

	it("moves the cups that sit in the swapped slots", () => {
		expect(shuffleOrder([0, 1, 2, 3, 4], pairOf(1, 3))).toEqual([
			0, 3, 2, 1, 4,
		]);
	});
});
