import { describe, expect, it } from "vitest";
import { kept, mark, spoken } from "./words";

const yours = (original: string, current: string) =>
	mark(original, current)
		.filter((w) => w.yours)
		.map((w) => w.text);

describe("spoken", () => {
	it("splits on any whitespace and drops empties", () => {
		expect(spoken("  send   reinforcements,\nnow ")).toEqual([
			"send",
			"reinforcements,",
			"now",
		]);
		expect(spoken("")).toEqual([]);
	});
});

describe("mark", () => {
	it("keeps every word of an unchanged sentence", () => {
		const words = mark("Send reinforcements now.", "send reinforcements, now");

		expect(kept(words)).toBe(3);
		expect(words.map((w) => w.text)).toEqual([
			"send",
			"reinforcements,",
			"now",
		]);
	});

	it("marks only the words that are no longer the speaker's", () => {
		expect(
			yours(
				"send reinforcements, we are going to advance.",
				"and range for moments we are going to advance.",
			),
		).toEqual(["we", "are", "going", "to", "advance."]);
	});

	it("respects order, so a moved word is not counted twice", () => {
		expect(yours("a b c", "c a b")).toEqual(["a", "b"]);
		expect(yours("the box the well", "the well the box")).toHaveLength(2);
	});

	it("has nothing left once the sentence is replaced", () => {
		expect(
			kept(mark("send reinforcements", "I'm not going to be able to do that.")),
		).toBe(0);
	});

	it("handles empty text on either side", () => {
		expect(mark("", "hello there")).toEqual([
			{ text: "hello", yours: false },
			{ text: "there", yours: false },
		]);
		expect(mark("hello", "")).toEqual([]);
	});

	it("does not treat bare punctuation as a kept word", () => {
		expect(kept(mark("well - done", "- - -"))).toBe(0);
	});
});
