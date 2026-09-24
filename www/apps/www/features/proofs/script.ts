import type { Level } from "./levels";
import { findMove } from "./levels";
import type { Goal, Step } from "./protocol";

export interface Change {
	added: string[];
	split: boolean;
	closed: boolean;
	remaining: number;
}

export function change(before: Goal[], after: Goal[]): Change {
	const had = new Set(
		(before[0]?.hyps ?? []).flatMap((h) =>
			h.names.map((n) => `${n}:${h.type}`),
		),
	);
	const added = (after[0]?.hyps ?? []).flatMap((h) =>
		h.names.filter((n) => !had.has(`${n}:${h.type}`)),
	);
	return {
		added,
		split: after.length > before.length,
		closed: after.length < before.length,
		remaining: after.length,
	};
}

export type Tone = "ask" | "moved" | "miss" | "done";

export interface Line {
	tone: Tone;
	text: string;
}

export function narrate(
	level: Level,
	before: Goal[],
	last: Step | null,
	solved: boolean,
	tried: number,
): Line {
	if (solved) return { tone: "done", text: level.done };
	if (!last) return { tone: "ask", text: level.ask };
	const move = findMove(level, last.tactic);
	if (!last.ok) {
		if (level.open && tried >= 2) return { tone: "done", text: level.done };
		return {
			tone: "miss",
			text:
				move?.miss ??
				gloss(last.error ?? "") ??
				"That move didn’t work here. Lean’s error is below.",
		};
	}
	if (move?.after) return { tone: "moved", text: move.after };
	const c = change(before, last.goals);
	if (c.split)
		return {
			tone: "moved",
			text: `The goal split into ${c.remaining}. Lean asks for them one at a time.`,
		};
	if (c.closed)
		return {
			tone: "moved",
			text: `That goal is done. ${c.remaining === 1 ? "One goal" : `${c.remaining} goals`} left.`,
		};
	if (c.added.length)
		return {
			tone: "moved",
			text: `You can now use ${c.added.join(", ")} in your proof.`,
		};
	return { tone: "moved", text: "The goal changed. Lean accepted the move." };
}

const symbols: [string, string][] = [
	["→", "if … then"],
	["∧", "and"],
	["∨", "or"],
	["¬", "not"],
	["↔", "if and only if"],
	["∀", "for every"],
	["∃", "there is"],
];

export function legend(goals: Goal[]): [string, string][] {
	const text = goals
		.slice(0, 1)
		.flatMap((g) => [g.target, ...g.hyps.map((h) => h.type)])
		.join(" ");
	return symbols.filter(([symbol]) => text.includes(symbol));
}

const kinds: Record<string, string> = {
	Prop: "statements",
	Nat: "whole numbers",
};

export function kind(type: string) {
	return kinds[type];
}

export function hint(level: Level, tactics: string[]) {
	const onTrack = tactics.every((t, i) => level.solution[i] === t);
	if (!onTrack) return null;
	return level.solution[tactics.length] ?? null;
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

export function gloss(error: string): string | null {
	const mismatch = error.match(
		/Type mismatch\s+([\s\S]+?)\s+has type\s+([\s\S]+?)\s+but is expected to have type\s+([\s\S]+?)$/,
	);
	if (mismatch) {
		const [, term, has, need] = mismatch.map(flat);
		if (has === "Prop")
			return `${term} is a statement, not a proof. The goal needs a proof of ${need}.`;
		return `${term} proves ${has}, but the goal needs ${need}.`;
	}
	const missing = error.match(
		/Did not find an occurrence of the pattern\s+([\s\S]+?)\s+in the target/,
	);
	if (missing)
		return `rw looks for ${flat(missing[1])} in the goal, and it is not there.`;
	if (/is not definitionally equal/.test(error))
		return "The two sides do not work out to the same thing, so rfl cannot close it.";
	if (/proved that the proposition[\s\S]*is false/.test(error))
		return "decide checked the claim and found it false.";
	const unknown = error.match(/Unknown (?:identifier|constant) `?([^`\s]+)`?/);
	if (unknown) return `Lean does not know anything called ${unknown[1]} here.`;
	if (/no goals/i.test(error)) return "There is nothing left to prove.";
	if (/unknown tactic|unexpected token|expected/i.test(error))
		return "Lean could not read that as a move. Check the spelling.";
	if (/disabled here/.test(error)) return error;
	return null;
}
