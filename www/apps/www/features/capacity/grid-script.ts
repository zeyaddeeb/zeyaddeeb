import { listing, money, ms, mw } from "./format";
import type { Edit } from "./game";
import {
	answerOf,
	type GridOutcome,
	type GridPhase,
	type Script,
} from "./grid-game";
import {
	dark,
	darkness,
	type GridCopy,
	type GridNames,
	type GuideContext,
} from "./grid-levels";
import type { GridFlow, GridLevel, GridSolved, GridWorld } from "./protocol";
import { type Narration, plainStatus, type Status } from "./script";

export interface GridShot {
	phase: GridPhase;
	step: number;
	copy: GridCopy;
	grid: GridWorld;
	level: GridLevel;
	names: GridNames;
	outcome: GridOutcome | null;
	complete: boolean;
	yours: GridSolved | null;
	best: GridSolved | null;
	live: GridSolved | null;
	guide: GuideContext;
	revealed: boolean;
	won: boolean;
	edit: Edit | null;
	frame: number;
	question: number;
	picks: string[];
	script: Script;
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

export function describePlan(
	flow: GridFlow,
	level: GridLevel,
	{ name }: GridNames,
): string {
	if (!level.placement)
		return listing(
			level.campuses.map(
				(c) => `${mw(c.mw)} at ${name(flow.placement[c.id] ?? "")}`,
			),
		);

	const changes = [
		...flow.built.map((l) => `build ${name(l)}`),
		...(flow.opened.length > 3
			? [`open all ${flow.opened.length} lines`]
			: flow.opened.map((l) => `open ${name(l)}`)),
	];

	return changes.length ? listing(changes) : "change nothing";
}

function thinking(shot: GridShot): Narration {
	const trace = shot.best?.trace ?? [];
	const step = trace[shot.frame];

	if (!step) return { tone: "ask", text: "" };

	const plan = describePlan(step.flow, shot.level, shot.names);
	const last = shot.frame === trace.length - 1;
	const nth = ORDINALS[shot.frame] ?? `${shot.frame + 1}th`;

	if (last)
		return {
			tone: "done",
			text: `Plan ${shot.frame + 1}: ${plan}, ${money(step.total)} an hour. The bound caught up at node ${step.nodes}: SCIP has proved nothing cheaper exists.`,
		};

	return {
		tone: "moved",
		text: `SCIP’s ${nth} plan: ${plan}, ${money(step.total)} an hour.${step.bound ? ` Proven so far: nothing beats ${money(step.bound)}.` : " It has no bound yet."}`,
	};
}

function answered(shot: GridShot): Narration {
	const question = shot.copy.questions?.[shot.question];
	const prices = shot.best?.prices;
	const pick = shot.picks[shot.question];

	if (!question || !prices || !pick) return { tone: "ask", text: "" };

	const answer = answerOf(prices, question.extreme) ?? pick;
	const context = { ...shot.names, prices, pick, answer };

	return pick === answer
		? { tone: "done", text: question.right(context) }
		: { tone: "miss", text: question.wrong(context) };
}

function action(outcome: GridOutcome, { name, line }: GridNames): string {
	switch (outcome.kind) {
		case "placed":
			return `${capital(name(outcome.campus))} plugs into ${name(outcome.substation)}.`;
		case "built":
			return `Built ${name(outcome.line)}, ${money(line(outcome.line)?.cost ?? 0)} an hour.`;
		case "unbuilt":
			return `Scrapped ${name(outcome.line)}.`;
		case "opened":
			return `Opened the breaker on ${name(outcome.line)}.`;
		case "closed":
			return `${name(outcome.line)} is back in service.`;
	}
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function summary(shot: GridShot): Narration {
	const { yours, best, revealed, level, names } = shot;

	if (!shot.complete) {
		const next = level.campuses.find((c) => !yours?.placement[c.id]);

		return {
			tone: "moved",
			text: next ? ` Now place ${names.name(next.id)}.` : "",
		};
	}

	if (!yours) return { tone: "moved", text: "" };

	if (dark(yours) > 0)
		return { tone: "miss", text: ` ${darkness(yours, names)}` };

	return {
		tone: "moved",
		text: ` Everyone has power for ${money(yours.totals.total)} an hour.${revealed && best ? ` The solver’s plan costs ${money(best.totals.total)}.` : " Is that the cheapest? Ask the solver."}`,
	};
}

export function gridNarrate(shot: GridShot): Narration {
	const { phase, copy, names, grid, level, won, best, live } = shot;

	if (phase === "guide")
		return { tone: "ask", text: copy.guide[shot.step]?.text(shot.guide) ?? "" };

	if (phase === "thinking") return thinking(shot);

	if (phase === "ask")
		return { tone: "ask", text: copy.questions?.[shot.question]?.ask ?? "" };

	if (phase === "told") return answered(shot);

	if (phase === "solved" && best) {
		const context = { grid, level, solved: best, yours: shot.yours, ...names };

		return {
			tone: won ? "done" : "moved",
			text: won ? copy.matched(context) : copy.aha(context),
		};
	}

	if (phase === "play" && live) {
		if (!shot.edit) return { tone: "ask", text: copy.play };

		const delta = live.totals.total - shot.edit.before;

		const change =
			Math.abs(delta) < 0.5
				? "no change in cost"
				: `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))} an hour`;

		const out = dark(live);

		return {
			tone: out > 0 ? "miss" : "moved",
			text: `${shot.edit.label}. The solver re-planned in ${ms(live.solver.ms)}: ${change}${out > 0 ? `, ${mw(Math.round(out))} dark` : ", everyone has power"}.`,
		};
	}

	if (!shot.outcome) return { tone: "ask", text: copy.ask };

	const tail = summary(shot);

	return {
		tone: tail.tone,
		text: `${action(shot.outcome, names)}${tail.text}`,
	};
}

export function gridStatus(
	solved: GridSolved | null,
	pending: boolean,
	down: boolean,
): Status {
	if (down) return plainStatus("Solver offline");

	if (pending) return plainStatus("Solving…");

	if (!solved) return plainStatus("OR-Tools is ready");

	const { engine, nodes, variables, constraints } = solved.solver;
	const time = ms(solved.solver.ms);

	if (engine === "GLOP")
		return {
			long: `GLOP solved the power flow: ${variables} variables, ${constraints} constraints in ${time}`,
			short: `GLOP · ${time}`,
		};

	const plural = nodes === 1 ? "node" : "nodes";

	if (nodes === 0)
		return {
			long: `${engine}: solved without branching, ${variables} variables in ${time}`,
			short: `SCIP · ${time}`,
		};

	return {
		long: `${engine}: ${nodes} branch-and-bound ${plural}, ${variables} variables in ${time}`,
		short: `SCIP · ${nodes} ${plural}`,
	};
}
