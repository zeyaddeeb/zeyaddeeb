export type ClaimStep =
	| "statements"
	| "mathlib"
	| "exception"
	| "zeta"
	| "primitive";

export interface ClaimLine {
	key: ClaimStep;
	code: string;
	ok: boolean;
	millis: number;
	axioms: string[];
	error: string | null;
}

export type ClaimAudit =
	| { status: "waiting" }
	| { status: "running"; since: number }
	| {
			status: "done";
			at: number;
			millis: number;
			lean: string;
			mathlib: string;
			lines: ClaimLine[];
	  }
	| { status: "unavailable" };

export interface ClaimStatement {
	number: number;
	name: string;
	title: string;
	plain: string;
	lean: string;
	step: ClaimStep;
}

export type Outcome = "pass" | "running" | "fail" | "waiting";

export interface ClaimCheck {
	title: string;
	detail: string;
	outcome: Outcome;
}

export const ANNOUNCED = "20 November 2026";

export const SOURCES = {
	note: "https://alpo.ge/remark.pdf",
	review: "https://math.mit.edu/~drew/grh/",
	mirror: "https://github.com/leanprover-community/riemann-hypothesis",
} as const;

export const STEP_TITLE: Record<ClaimStep, string> = {
	statements: "The four definitions elaborate against Mathlib",
	mathlib: "Statement 2 is Mathlib’s definition, by rfl",
	exception: "Statement 1 needs its exception: ζ(−2) = 0",
	zeta: "Statement 4 covers ζ itself, at modulus 1",
	primitive: "Statement 5 follows from statement 4",
};

export const STATEMENTS: ClaimStatement[] = [
	{
		number: 1,
		name: "riemannHypothesis",
		title: "The Riemann hypothesis",
		plain:
			"Every zero of ζ other than −2, −4, −6, … has real part ½, in Mathlib’s own words.",
		lean: [
			"theorem riemannHypothesis : RiemannHypothesis",
			"",
			"def RiemannHypothesis : Prop :=",
			"  ∀ (s : ℂ) (_ : riemannZeta s = 0) (_ : ¬∃ n : ℕ, s = -2 * (n + 1)) (_ : s ≠ 1), s.re = 1 / 2",
		].join("\n"),
		step: "exception",
	},
	{
		number: 2,
		name: "riemannZeta_eq_zero_re",
		title: "The same, written out",
		plain:
			"The author’s own wording of the hypothesis, which Lean must accept as Mathlib’s.",
		lean: [
			"theorem riemannZeta_eq_zero_re : RiemannZetaZerosOnLine",
			"",
			"def RiemannZetaZerosOnLine : Prop :=",
			"  ∀ s : ℂ, riemannZeta s = 0 → (¬∃ n : ℕ, s = -2 * ((n : ℂ) + 1)) → s ≠ 1 → s.re = 1 / 2",
		].join("\n"),
		step: "mathlib",
	},
	{
		number: 3,
		name: "LFunction_ne_zero_of_half_lt_re",
		title: "No zeros right of the line",
		plain:
			"For every Dirichlet character χ, L(χ, s) ≠ 0 when Re s > ½, except the trivial character at its pole.",
		lean: [
			"theorem LFunction_ne_zero_of_half_lt_re : DirichletLNonvanishingRightOfHalf",
			"",
			"def DirichletLNonvanishingRightOfHalf : Prop :=",
			"  ∀ (N : ℕ) [NeZero N] (χ : DirichletCharacter ℂ N) (s : ℂ),",
			"    1 / 2 < s.re → (χ ≠ 1 ∨ s ≠ 1) → DirichletCharacter.LFunction χ s ≠ 0",
		].join("\n"),
		step: "statements",
	},
	{
		number: 4,
		name: "LFunction_eq_zero_re",
		title: "Every strip zero on the line",
		plain:
			"For every Dirichlet character, zeros with 0 < Re s < 1 have Re s = ½: GRH for Dirichlet L-functions.",
		lean: [
			"theorem LFunction_eq_zero_re : DirichletLZerosOnLine",
			"",
			"def DirichletLZerosOnLine : Prop :=",
			"  ∀ (N : ℕ) [NeZero N] (χ : DirichletCharacter ℂ N) (s : ℂ),",
			"    0 < s.re → s.re < 1 → DirichletCharacter.LFunction χ s = 0 → s.re = 1 / 2",
		].join("\n"),
		step: "zeta",
	},
	{
		number: 5,
		name: "LFunction_eq_zero_re_of_isPrimitive",
		title: "GRH as usually stated",
		plain:
			"The same for primitive characters, the form in which GRH for Dirichlet L-functions is usually written.",
		lean: [
			"theorem LFunction_eq_zero_re_of_isPrimitive : PrimitiveDirichletLZerosOnLine",
			"",
			"def PrimitiveDirichletLZerosOnLine : Prop :=",
			"  ∀ (N : ℕ) [NeZero N] (χ : DirichletCharacter ℂ N), χ.IsPrimitive →",
			"    ∀ s : ℂ, 0 < s.re → s.re < 1 → DirichletCharacter.LFunction χ s = 0 → s.re = 1 / 2",
		].join("\n"),
		step: "primitive",
	},
];

export const ONCE_CHECKED = "22 November 2026";

export const ONCE: ClaimCheck[] = [
	{
		title: "The archive is the one checked elsewhere",
		detail:
			"14 parts from the author’s site, 239,275,554 bytes, sha256 9631b4f0…c7fc",
		outcome: "pass",
	},
	{
		title: "Its statements are the file Lean checks here",
		detail: "Statements.lean, byte for byte, sha256 79ef7ca7…47bf",
		outcome: "pass",
	},
	{
		title: "The exported proof matches its published hash",
		detail: "7.7 GB compressed, sha256 61a8938a…1b05381",
		outcome: "pass",
	},
];

export const ELSEWHERE_BY = "Andrew Sutherland, MIT";

export const ELSEWHERE_AS_OF = "22 Nov 2026, 16:20 UTC";

export const ELSEWHERE: ClaimCheck[] = [
	{
		title: "All 175,187 files compile",
		detail: "Lean 4.33.1 and Mathlib 4.33.1, zero errors",
		outcome: "pass",
	},
	{
		title: "Only the three standard axioms",
		detail: "propext, Classical.choice, Quot.sound for all five theorems",
		outcome: "pass",
	},
	{
		title: "A sandboxed rebuild reproduces it",
		detail: "No network, read-only source, export identical byte for byte",
		outcome: "pass",
	},
	{
		title: "Lean’s kernel replays every file",
		detail: "leanchecker, 175,187 of 175,187",
		outcome: "pass",
	},
	{
		title: "Two independent kernels accept it",
		detail: "nanoda, written in Rust, and con-leche, proved consistent in Lean",
		outcome: "pass",
	},
	{
		title: "The five statements match the challenge",
		detail: "con-leche and con-ron compare modes, all five justified",
		outcome: "pass",
	},
	{
		title: "lean4lean accepts every file",
		detail: "Five needed a higher step limit for kernel computations",
		outcome: "pass",
	},
	{
		title: "Lean’s kernel on the whole export",
		detail:
			"Single-threaded since 20 November, the last stage of lake comparator",
		outcome: "running",
	},
];

const TALLY: [Outcome, string][] = [
	["pass", "passed"],
	["running", "running"],
	["fail", "failed"],
];

export function tally(checks: ClaimCheck[]): string {
	return TALLY.map(
		([outcome, word]) =>
			[checks.filter((c) => c.outcome === outcome).length, word] as const,
	)
		.filter(([count]) => count > 0)
		.map(([count, word]) => `${count} ${word}`)
		.join(", ");
}

export function stepOutcome(
	audit: ClaimAudit | null,
	step: ClaimStep,
): Outcome {
	if (!audit || audit.status === "waiting" || audit.status === "running")
		return "running";

	if (audit.status === "unavailable") return "waiting";

	const line = audit.lines.find((l) => l.key === step);

	if (!line) return "waiting";

	return line.ok ? "pass" : "fail";
}

export function auditLine(audit: ClaimAudit | null): string {
	if (!audit) return "Asking Lean…";

	switch (audit.status) {
		case "waiting":
		case "running":
			return "Lean is loading Mathlib…";
		case "unavailable":
			return "Lean is not running here right now.";
		case "done": {
			const passed = audit.lines.filter((l) => l.ok).length;
			const seconds = (audit.millis / 1000).toFixed(1);

			return `${passed} of ${audit.lines.length} passed in ${seconds} s · Lean ${audit.lean.replace(/^v/, "")}`;
		}
	}
}
