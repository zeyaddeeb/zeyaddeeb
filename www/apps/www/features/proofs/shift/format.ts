import type { Trust, Verdict } from "./protocol";

const LABELS: Record<string, string> = {
	plan: "Plan",
	conjecture: "Conjecture",
	formalize: "Ask Lean",
	recall: "Recall",
	link: "Link",
	conclude: "Conclude",
	line: "Scan the line",
	contour: "Search off the line",
	spacing: "Compare with random matrices",
	robin: "Robin’s inequality",
	mertens: "Mertens function",
	hasse: "Count points on a curve",
	zeta: "Evaluate ζ",
	insight: "Insight",
	letter: "Letter to itself",
	reduce: "Reduce in Lean",
	revise: "Revise its rules",
};

const SHORT: Record<string, string> = {
	plan: "Plan",
	conjecture: "Claim",
	formalize: "Lean",
	recall: "Recall",
	link: "Link",
	conclude: "Conclude",
	line: "Line",
	contour: "Off the line",
	spacing: "Spacing",
	robin: "Robin",
	mertens: "Mertens",
	hasse: "Curve",
	zeta: "ζ",
	insight: "Insight",
	letter: "Letter",
	reduce: "Reduce",
	revise: "Revise",
};

export function short(tool: string): string {
	return SHORT[tool] ?? tool;
}

const CHIP = 18;

function clipped(text: string): string {
	return text.length <= CHIP ? text : `${text.slice(0, CHIP - 1)}…`;
}

export function chip(tool: string, args: Record<string, unknown>): string {
	const name = short(tool);
	const detail = (() => {
		switch (tool) {
			case "formalize":
				return (
					/(?:theorem|lemma)\s+(\S+)/.exec(text(args, "statement"))?.[1] ?? ""
				);
			case "conjecture":
			case "insight":
				return text(args, "title");
			case "line": {
				const from = num(args, "from");
				const to = num(args, "to");
				return from === null
					? ""
					: `${Math.round(from)}–${Math.round(to ?? from + 60)}`;
			}
			case "contour": {
				const from = num(args, "t_from");
				return from === null ? "" : `t ${Math.round(from)}`;
			}
			case "robin": {
				const n = num(args, "n");
				return n === null
					? `ε ${num(args, "epsilon") ?? 0.01}`
					: `n ${count(n)}`;
			}
			case "mertens":
				return `x ${count(num(args, "x") ?? 0)}`;
			case "hasse":
				return `${num(args, "a") ?? 0}, ${num(args, "b") ?? 0}`;
			case "reduce":
				return text(args, "target");
			case "revise": {
				const change = text(args, "change");
				const rule = num(args, "rule");
				return rule === null ? change : `${change} ${rule}`;
			}
			default:
				return "";
		}
	})();
	return detail ? `${name} · ${clipped(detail)}` : name;
}

export const TRUST: Record<Trust, string> = {
	open: "Open",
	mathlib: "In Mathlib",
	literature: "Published",
	verified: "Proved in Lean",
	measured: "Measured",
	conjectured: "Conjectured",
	refuted: "Refuted",
};

const grouping = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function label(tool: string): string {
	return LABELS[tool] ?? tool;
}

export function count(value: number): string {
	return grouping.format(value);
}

function unit(value: number, word: string): string {
	return `${value} ${word}${value === 1 ? "" : "s"}`;
}

export function duration(ms: number): string {
	const minutes = Math.max(0, Math.floor(ms / 60_000));
	const days = Math.floor(minutes / 1440);
	const hours = Math.floor((minutes % 1440) / 60);
	if (days > 0) return `${unit(days, "day")} ${unit(hours, "hour")}`;
	if (hours > 0)
		return `${unit(hours, "hour")} ${unit(minutes % 60, "minute")}`;
	return unit(minutes, "minute");
}

export function clock(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function num(args: Record<string, unknown>, key: string): number | null {
	const value = args[key];
	if (typeof value === "number") return value;
	if (
		typeof value === "string" &&
		value.trim() !== "" &&
		!Number.isNaN(Number(value))
	)
		return Number(value);
	return null;
}

function text(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	return typeof value === "string" ? value : "";
}

export function describe(tool: string, args: Record<string, unknown>): string {
	switch (tool) {
		case "line": {
			const from = num(args, "from");
			const to = num(args, "to");
			return from === null && to === null
				? "extend the verified stretch"
				: `t ${count(from ?? 0)} → ${count(to ?? (from ?? 0) + 60)}`;
		}
		case "contour":
			return `σ ${num(args, "sigma_from")}–${num(args, "sigma_to")} · t ${count(num(args, "t_from") ?? 0)}–${count(num(args, "t_to") ?? 0)}`;
		case "spacing": {
			const from = num(args, "from");
			const to = num(args, "to");
			return from === null && to === null
				? "every located zero"
				: `t ${count(from ?? 0)} → ${to === null ? "top" : count(to)}`;
		}
		case "robin": {
			const n = num(args, "n");
			return n === null
				? `ε = ${num(args, "epsilon") ?? 0.01}`
				: `n = ${count(n)}`;
		}
		case "mertens":
			return `x = ${count(num(args, "x") ?? 0)}`;
		case "hasse": {
			const a = num(args, "a") ?? 0;
			const b = num(args, "b") ?? 0;
			const sign = (v: number) => (v < 0 ? "−" : "+");
			return `y² = x³ ${sign(a)} ${Math.abs(a)}x ${sign(b)} ${Math.abs(b)}`;
		}
		case "zeta":
			return `s = ${num(args, "re")} + ${num(args, "im")}i`;
		case "plan":
			return text(args, "objective");
		case "conjecture":
		case "insight":
			return text(args, "title");
		case "formalize":
			return text(args, "statement");
		case "recall":
			return `“${text(args, "query")}”`;
		case "link":
			return `${text(args, "from")} ${text(args, "relation")} ${text(args, "to")}`;
		case "conclude":
			return text(args, "summary");
		case "letter":
			return text(args, "text");
		case "reduce": {
			const from = statements(args);
			return `${text(args, "target")} from ${from.length} ${from.length === 1 ? "statement" : "statements"}`;
		}
		case "revise":
			return text(args, "text") || text(args, "because");
		default:
			return "";
	}
}

export function statements(args: Record<string, unknown>): string[] {
	const from = args.from;
	if (Array.isArray(from))
		return from.filter((item): item is string => typeof item === "string");
	return typeof from === "string" && from.trim() ? [from] : [];
}

export const MOVES: Record<string, string> = {
	backwards: "Work backwards",
	decompose: "Decompose",
	specialize: "Specialize",
	generalize: "Generalize",
	analogy: "Analogy",
	related: "A related problem",
};

export function prediction(args: Record<string, unknown>): string | null {
	const expect = args.expect as Record<string, unknown> | undefined;
	if (!expect || typeof expect !== "object") return null;
	const field = typeof expect.field === "string" ? expect.field : "";
	const op = typeof expect.op === "string" ? expect.op : "";
	const value = num(expect, "value");
	if (!field || !op || value === null) return null;
	return `${field.replaceAll("_", " ")} ${op} ${value}`;
}

export function verdict(v: Verdict): string {
	const observed = Number.isInteger(v.observed)
		? count(v.observed)
		: v.observed.toPrecision(4);
	const measured = `${v.field.replaceAll("_", " ")} was ${observed}`;
	if (v.known && v.held)
		return `Known in advance (${v.known}): ${measured}. It earns nothing.`;
	return `${v.held ? "Held" : "Broke"}: ${measured}`;
}

export function words(value: string): number {
	return value.trim() ? value.trim().split(/\s+/).length : 0;
}
