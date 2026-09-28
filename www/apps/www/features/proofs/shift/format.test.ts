import { expect, it, describe as suite } from "vitest";
import { chip, clock, describe, duration, prediction, verdict } from "./format";

suite("shift copy", () => {
	it("reads durations like a clock on the wall", () => {
		expect(duration(5 * 60_000)).toBe("5 minutes");
		expect(duration(61 * 60_000)).toBe("1 hour 1 minute");
		expect(duration((2 * 1440 + 180) * 60_000)).toBe("2 days 3 hours");
		expect(clock(272)).toBe("4:32");
	});

	it("describes instrument calls in plain terms", () => {
		expect(describe("line", {})).toBe("extend the verified stretch");
		expect(describe("line", { from: 1000, to: 1200 })).toBe("t 1,000 → 1,200");
		expect(
			describe("contour", {
				sigma_from: 0.6,
				sigma_to: 0.9,
				t_from: 100,
				t_to: 140,
			}),
		).toBe("σ 0.6–0.9 · t 100–140");
		expect(describe("hasse", { a: -1, b: 1 })).toBe("y² = x³ − 1x + 1");
		expect(describe("robin", { epsilon: "0.001" })).toBe("ε = 0.001");
	});

	it("labels steps so repeated tools can be told apart", () => {
		expect(
			chip("formalize", {
				statement: "theorem zero_mirror_4 (s : ℂ) : True",
			}),
		).toBe("Lean · zero_mirror_4");
		expect(chip("line", { from: 1000, to: 1060 })).toBe("Line · 1000–1060");
		expect(chip("plan", {})).toBe("Plan");
		expect(chip("conjecture", { title: "A very long claim title here" })).toBe(
			"Claim · A very long claim…",
		);
	});

	it("states predictions and verdicts", () => {
		expect(
			prediction({ expect: { field: "missing", op: "=", value: 0 } }),
		).toBe("missing = 0");
		expect(prediction({})).toBeNull();
		expect(
			verdict({
				field: "distance_gue",
				op: "<",
				value: 0.01,
				observed: 0.0234,
				held: false,
			}),
		).toBe("Broke: distance gue was 0.02340");
		expect(
			verdict({
				field: "worst_ratio",
				op: "<=",
				value: 1,
				observed: 0.9812,
				held: true,
				known: "Hasse 1933",
			}),
		).toBe(
			"Known in advance (Hasse 1933): worst ratio was 0.9812. It earns nothing.",
		);
	});
});
