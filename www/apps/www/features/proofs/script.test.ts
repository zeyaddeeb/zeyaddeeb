import { describe, expect, it } from "vitest";
import { findLevel, type Level, levels } from "./levels";
import type { Goal, Step } from "./protocol";
import { change, gloss, hint, legend, narrate } from "./script";

function level(id: string): Level {
	const found = findLevel(id);
	if (!found) throw new Error(id);
	return found;
}

const goal = (target: string, hyps: [string[], string][] = []): Goal => ({
	case: null,
	hyps: hyps.map(([names, type]) => ({ names, type })),
	target,
});

const step = (tactic: string, goals: Goal[], ok = true): Step => ({
	tactic,
	ok,
	goals,
	error: ok ? null : "Type mismatch",
});

describe("levels", () => {
	it("have unique ids and a solution drawn from their own moves", () => {
		expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length);
		for (const level of levels) {
			const tactics = new Set(level.moves.map((m) => m.tactic));
			for (const t of level.solution) expect(tactics.has(t)).toBe(true);
			if (!level.open) expect(level.solution.length).toBeGreaterThan(0);
		}
	});
});

describe("change", () => {
	it("finds new hypotheses and splits", () => {
		const before = [goal("p → q → p", [[["p", "q"], "Prop"]])];
		const after = [
			goal("q → p", [
				[["p", "q"], "Prop"],
				[["hp"], "p"],
			]),
		];
		expect(change(before, after)).toMatchObject({
			added: ["hp"],
			split: false,
		});
		expect(change(after, [goal("q"), goal("p")]).split).toBe(true);
		expect(change([goal("q"), goal("p")], [goal("p")]).closed).toBe(true);
	});
});

describe("narrate", () => {
	const intro = level("intro");
	const start = [goal("p → q → p", [[["p", "q"], "Prop"]])];

	it("asks before any move", () => {
		expect(narrate(intro, start, null, false, 0).tone).toBe("ask");
	});

	it("uses the move's own words, then falls back to what changed", () => {
		const moved = narrate(intro, start, step("intro hp", start), false, 1);
		expect(moved.text).toMatch(/became hp/);
		const other = narrate(
			level("and"),
			[goal("q ∧ p")],
			step("constructor", [goal("q"), goal("p")]),
			false,
			1,
		);
		expect(other.text).toMatch(/two/);
	});

	it("explains misses and finishes open levels after two tries", () => {
		expect(
			narrate(intro, start, step("exact hq", [], false), false, 1).tone,
		).toBe("miss");
		const falseLevel = level("false");
		expect(narrate(falseLevel, [], step("rfl", [], false), false, 2).tone).toBe(
			"done",
		);
	});
});

describe("legend and hint", () => {
	it("keys only the symbols on the board", () => {
		expect(legend([goal("p ∧ q → q ∧ p")]).map(([s]) => s)).toEqual(["→", "∧"]);
	});

	it("points at the next solution move while on track", () => {
		const and = level("and");
		expect(hint(and, ["intro h"])).toBe("obtain ⟨hp, hq⟩ := h");
		expect(hint(and, ["constructor"])).toBeNull();
	});
});

describe("gloss", () => {
	it("translates the errors Lean gives in these levels", () => {
		expect(
			gloss(
				"Type mismatch\n  hp\nhas type\n  p\nbut is expected to have type\n  q",
			),
		).toBe("hp proves p, but the goal needs q.");
		expect(
			gloss(
				"Type mismatch\n  p\nhas type\n  Prop\nbut is expected to have type\n  p",
			),
		).toMatch(/statement, not a proof/);
		expect(
			gloss(
				"Tactic `rewrite` failed: Did not find an occurrence of the pattern\n  0 + k\nin the target expression\n  0 + (k + 1) = k + 1",
			),
		).toBe("rw looks for 0 + k in the goal, and it is not there.");
		expect(gloss("Unknown identifier `hr`")).toMatch(/called hr/);
		expect(gloss("something new")).toBeNull();
	});
});
