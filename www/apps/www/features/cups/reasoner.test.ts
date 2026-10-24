import { describe, expect, it } from "vitest";
import {
	belief,
	EMPTY,
	type Envelope,
	pieces,
	reduce,
	settled,
	words,
	written,
} from "./reasoner";

const play = (events: Envelope[]) => events.reduce(reduce, EMPTY);

describe("reasoner", () => {
	it("streams text and keeps one probe per point", () => {
		const t = play([
			{ seq: 1, t: "text", s: "Ball at " },
			{ seq: 2, t: "text", s: "3.\n" },
			{ seq: 3, t: "probe", at: 11, p: [0, 0, 0.9, 0.1, 0] },
			{ seq: 4, t: "probe", at: 11, p: [0, 0, 0.95, 0.05, 0] },
		]);

		expect(t.text).toBe("Ball at 3.\n");
		expect(t.probes).toEqual([{ at: 11, p: [0, 0, 0.95, 0.05, 0] }]);
		expect(belief(t)?.pick).toBe(2);
	});

	it("cuts back to a forged digit and drops later probes", () => {
		const t = play([
			{ seq: 1, t: "text", s: "Ball at 3.\nThen 4.\n" },
			{ seq: 2, t: "probe", at: 11, p: [0, 0, 1, 0, 0] },
			{ seq: 3, t: "probe", at: 19, p: [0, 0, 0, 1, 0] },
			{ seq: 4, t: "cut", len: 8 },
			{ seq: 5, t: "text", s: "5" },
		]);

		expect(t.text).toBe("Ball at 5");
		expect(t.probes).toEqual([]);
	});

	it("ignores stale events but always takes a snapshot", () => {
		const t = play([
			{ seq: 5, t: "text", s: "late" },
			{ seq: 3, t: "text", s: "early" },
		]);

		expect(t.text).toBe("late");
		expect(
			reduce(t, {
				seq: 2,
				t: "snapshot",
				text: "fresh",
				probes: [],
				meter: EMPTY.meter,
			}).text,
		).toBe("fresh");
	});

	it("finds where its top answer stopped changing", () => {
		const t = play([
			{ seq: 1, t: "probe", at: 5, p: [0, 0.95, 0, 0, 0] },
			{ seq: 2, t: "probe", at: 9, p: [0, 0.4, 0.6, 0, 0] },
			{ seq: 3, t: "probe", at: 14, p: [0.3, 0.62, 0, 0, 0] },
			{ seq: 4, t: "probe", at: 20, p: [0, 0.99, 0, 0, 0] },
		]);

		expect(settled(t, 1)).toBe(14);
		expect(settled(t, 2)).toBeNull();
	});

	it("reads the answer it wrote, not the one it is checking", () => {
		expect(written("Final Answer: 5.\nLet me re-verify. Start: P = 3.")).toBe(
			4,
		);
		expect(written("**Final Position:** 2")).toBe(1);
		expect(written("Step 4: ball at 3.")).toBeNull();
	});

	it("marks only lone cup digits as forgeable", () => {
		const marked = pieces("Swap 2 & 5: ball at 15? No, at 3. Step 6.")
			.filter((p) => p.digit)
			.map((p) => [p.text, p.at]);

		expect(marked).toEqual([
			["2", 5],
			["5", 9],
			["3", 31],
		]);
		expect(words(" a  b\nc ")).toBe(3);
	});
});
