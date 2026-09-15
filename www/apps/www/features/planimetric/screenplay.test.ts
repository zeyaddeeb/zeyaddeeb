import { describe, expect, it } from "vitest";
import {
	arrival,
	compile,
	drawingFrame,
	durationOf,
	format,
	frameRect,
	INITIAL_SCRIPT,
	locate,
	schedule,
	setups,
} from "./screenplay";

describe("screenplay compiler", () => {
	it("fits every camera position into the mobile drawing without clipping the move", () => {
		for (const shot of compile(INITIAL_SCRIPT).screenplay.shots) {
			const view = frameRect(drawingFrame(shot));
			expect(view.w / view.h).toBeCloseTo(4 / 3);
			for (const frame of setups[shot.setup].frames) {
				const rect = frameRect(frame);
				expect(view.x).toBeLessThan(rect.x);
				expect(view.y).toBeLessThan(rect.y);
				expect(view.x + view.w).toBeGreaterThan(rect.x + rect.w);
				expect(view.y + view.h).toBeGreaterThan(rect.y + rect.h);
			}
		}
	});
	it("compiles the shooting script into eight timed setups", () => {
		const { screenplay, error } = compile(INITIAL_SCRIPT);
		expect(error).toBeNull();
		expect(screenplay.heading).toMatch(/^INT\. HOTEL KUBERNETES/);
		expect(screenplay.shots.map((shot) => shot.setup)).toEqual([
			"WIDE",
			"DOLLY",
			"WHIP",
			"OVERHEAD",
			"PORTRAIT",
			"CARD",
			"TABLEAU",
			"PULL",
		]);
		expect(screenplay.shots[4]).toMatchObject({
			character: "ANNA",
			parenthetical: "evenly",
			dialogue: "I would like to stop existing here.",
		});
		expect(screenplay.shots[5].action).toBe("PART TWO: DESIRED STATE");
		expect(screenplay.shots[5].character).toBe("");
		expect(durationOf(schedule(screenplay.shots))).toBe(38);
	});

	it("keeps the timeline contiguous and clamps the end", () => {
		const cues = schedule(compile(INITIAL_SCRIPT).screenplay.shots);
		expect(cues[1]).toMatchObject({ start: 6, end: 11, index: 1 });
		expect(locate(cues, 5.99).index).toBe(0);
		expect(locate(cues, 6).index).toBe(1);
		expect(locate(cues, 500).index).toBe(7);
	});

	it("uses each setup's default length when the cue has none", () => {
		const { screenplay } = compile("[[WHIP]]\nA glance.");
		expect(screenplay.shots[0].duration).toBe(setups.WHIP.seconds);
	});

	it("joins multi-line dialogue and stops at a blank line", () => {
		const { screenplay, error } = compile(
			"[[WIDE 2]]\nOTTO\nOne.\nTwo.\n\nThe room waits.",
		);
		expect(error).toBeNull();
		expect(screenplay.shots[0].dialogue).toBe("One. Two.");
		expect(screenplay.shots[0].action).toBe("The room waits.");
	});

	it("rejects malformed scripts with the offending line", () => {
		expect(compile("").error).toMatch(/camera cue/);
		expect(compile("Hello").error).toMatch(/Line 1/);
		expect(compile("[[PAN 4]]").error).toMatch(/Line 1/);
		expect(compile("[[WIDE 0]]").error).toMatch(/between 1 and 12/);
		expect(compile("[[WIDE 13]]").error).toMatch(/between 1 and 12/);
		expect(compile("[[WIDE 4]]\nOTTO\nHi.\nANNA\nBye.").error).toBeNull();
		expect(compile("[[WIDE 4]]\nOTTO\nHi.\n\nANNA\nBye.").error).toMatch(
			/one speaker/,
		);
		expect(compile("[[WIDE 4]]\nOTTO\n\n[[WIDE 2]]").error).toMatch(
			/OTTO needs a line/,
		);
		expect(compile("[[WIDE 4]]\nOTTO").error).toMatch(/OTTO needs a line/);
		expect(compile(Array(11).fill("[[WIDE 1]]").join("\n")).error).toMatch(
			/at most 10/,
		);
	});

	it("round-trips through the formatter", () => {
		const first = compile(INITIAL_SCRIPT).screenplay;
		const second = compile(format(first)).screenplay;
		expect(second).toEqual(first);
	});

	it("describes camera frames as rectangles on the drawing", () => {
		expect(frameRect("600 1251 1200 649")).toEqual({
			x: 600,
			y: 1251,
			w: 1200,
			h: 649,
		});
		for (const setup of Object.values(setups)) {
			for (const frame of setup.frames) {
				const { w, h } = frameRect(frame);
				expect(w / h).toBeCloseTo(1.85, 1);
			}
			for (const frame of setup.tall) {
				const { w, h } = frameRect(frame);
				expect(w / h).toBeCloseTo(0.6, 1);
			}
			expect(setup.tall.length).toBe(setup.frames.length);
		}
		const pull = compile(INITIAL_SCRIPT).screenplay.shots[7];
		expect(arrival(pull)).toBe(setups.PULL.frames[1]);
		expect(arrival(pull, true)).toBe(setups.PULL.tall[1]);
	});
});
