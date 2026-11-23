import { describe, expect, it } from "vitest";
import {
	auditLine,
	type ClaimAudit,
	type ClaimLine,
	STATEMENTS,
	STEP_TITLE,
	stepOutcome,
} from "./claim";

function line(key: ClaimLine["key"], ok: boolean): ClaimLine {
	return { key, code: "", ok, millis: 12, axioms: [], error: ok ? null : "no" };
}

const done: ClaimAudit = {
	status: "done",
	at: 0,
	millis: 2_200,
	lean: "v4.35.0",
	mathlib: "v4.35.0",
	lines: [
		line("statements", true),
		line("mathlib", true),
		line("exception", true),
		line("zeta", false),
		line("primitive", true),
	],
};

describe("the claim", () => {
	it("numbers its five statements in order and maps each to a live step", () => {
		expect(STATEMENTS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);

		for (const statement of STATEMENTS) {
			expect(STEP_TITLE[statement.step]).toBeTruthy();
		}
	});

	it("reads each step's outcome from the audit", () => {
		expect(stepOutcome(done, "mathlib")).toBe("pass");
		expect(stepOutcome(done, "zeta")).toBe("fail");
		expect(stepOutcome(null, "mathlib")).toBe("running");
		expect(stepOutcome({ status: "running", since: 0 }, "zeta")).toBe(
			"running",
		);
		expect(stepOutcome({ status: "unavailable" }, "zeta")).toBe("waiting");
	});

	it("summarizes the audit in one line", () => {
		expect(auditLine(done)).toBe("4 of 5 passed in 2.2 s · Lean 4.35.0");
		expect(auditLine({ status: "waiting" })).toBe("Lean is loading Mathlib…");
		expect(auditLine({ status: "unavailable" })).toBe(
			"Lean is not running here right now.",
		);
	});
});
