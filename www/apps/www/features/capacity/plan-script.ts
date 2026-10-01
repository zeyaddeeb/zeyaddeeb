import { listing, money, ms, mw } from "./format";
import type { PlanOutcome, PlanPhase } from "./plan-game";
import type { PlanContext, PlanCopy, PlanNames } from "./plan-levels";
import type { CaseResult, PlanLevel, PlanSolved, Schedule } from "./protocol";
import { type Narration, plainStatus, type Status } from "./script";

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

export interface PlanShot {
	phase: PlanPhase;
	step: number;
	frame: number;
	copy: PlanCopy;
	level: PlanLevel;
	names: PlanNames;
	outcome: PlanOutcome | null;
	context: PlanContext | null;
	yours: PlanSolved | null;
	best: PlanSolved | null;
	won: boolean;
	guess: number | null;
}

const COMMON = /^(Rebuild|Turbines|Rush) /;

const lower = (name: string) =>
	COMMON.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;

const darkOf = (c: CaseResult) =>
	Object.values(c.flow.shed).reduce((a, b) => a + b, 0);

export function describeSchedule(
	schedule: Schedule,
	level: PlanLevel,
	names: PlanNames,
): string {
	const label = (id: string) =>
		level.cases.find((c) => c.id === id)?.label ?? id;

	const parts = [
		...schedule.starts.map((s) => {
			const p = names.project(s.project);

			if (p?.kind === "plant") return `order ${s.count} blocks`;

			return `${lower(names.projectName(s.project))} from ${names.period(level, s.period)}`;
		}),
		...schedule.rentals.map(
			(r) =>
				`${r.blocks} turbine block${r.blocks > 1 ? "s" : ""} in ${label(r.case)}`,
		),
		...(schedule.opened.length > 2
			? [`open ${schedule.opened.length} breakers`]
			: schedule.opened.map(
					(o) => `open ${names.name(o.line)} in ${label(o.case)}`,
				)),
	];

	return parts.length ? listing(parts) : "build nothing";
}

function summary(shot: PlanShot): string {
	const { yours, level } = shot;

	if (!yours) return "";

	const futures = level.periods === 1 && level.cases.length > 1;
	const dark = yours.cases.filter((c) => darkOf(c) > 0.5);
	const score = level.objective === "worst" ? yours.worst : yours.total;

	const what =
		level.objective === "worst"
			? "Worst future"
			: futures
				? "Expected hour"
				: "Average hour";

	const out = dark.length
		? ` ${listing(
				dark.map((c) => {
					const label = level.cases.find((x) => x.id === c.case)?.label;

					return `${label} loses ${mw(Math.round(darkOf(c)))}`;
				}),
			)}.`
		: "";

	return ` ${what}: ${money(score)}.${out}`;
}

function action(outcome: PlanOutcome, shot: PlanShot): string {
	const { names, level } = shot;
	const label = (id: string) =>
		level.cases.find((c) => c.id === id)?.label ?? id;

	switch (outcome.kind) {
		case "start": {
			const p = names.project(outcome.project);

			if (outcome.period === null)
				return `${names.projectName(outcome.project)}: not started.`;

			const ready = names.period(level, outcome.period + (p?.lead ?? 0));

			return `${names.projectName(outcome.project)} starts ${names.period(level, outcome.period)}${p && outcome.period + p.lead < level.cases.length ? `, in service ${ready}` : ", in service too late"}.`;
		}
		case "size":
			return `Order ${outcome.count} block${outcome.count === 1 ? "" : "s"} today.`;
		case "rent":
			return `${outcome.blocks} turbine block${outcome.blocks === 1 ? "" : "s"} in ${label(outcome.case)}.`;
		case "open":
			return `Opened ${names.name(outcome.line)} in ${label(outcome.case)}.`;
		case "close":
			return `${names.name(outcome.line)} is back in service in ${label(outcome.case)}.`;
	}
}

function thinking(shot: PlanShot): Narration {
	const trace = shot.best?.trace ?? [];
	const step = trace[shot.frame];

	if (!step) return { tone: "ask", text: "" };

	const plan = describeSchedule(step.schedule, shot.level, shot.names);
	const nth = ORDINALS[shot.frame] ?? `${shot.frame + 1}th`;

	if (shot.frame === trace.length - 1)
		return {
			tone: "done",
			text: `Plan ${shot.frame + 1}: ${plan}, ${money(step.total)} an hour. The bound caught up: SCIP has proved nothing cheaper exists.`,
		};

	return {
		tone: "moved",
		text: `SCIP’s ${nth} plan: ${plan}, ${money(step.total)} an hour.${step.bound ? ` Proven so far: nothing beats ${money(step.bound)}.` : " It has no bound yet."}`,
	};
}

export function planNarrate(shot: PlanShot): Narration {
	const { phase, copy, context } = shot;

	if (phase === "guide")
		return {
			tone: "ask",
			text:
				copy.guide[shot.step]?.text({ ...shot.names, level: shot.level }) ?? "",
		};

	if (phase === "thinking") return thinking(shot);

	if (phase === "guess") return { tone: "ask", text: copy.guess?.ask ?? "" };

	if (phase === "told" && context && copy.guess)
		return {
			tone: shot.won ? "done" : "moved",
			text: copy.guess.reveal(context, shot.guess ?? 0),
		};

	if (phase === "solved" && context)
		return {
			tone: shot.won ? "done" : "moved",
			text: shot.won ? copy.matched(context) : copy.aha(context),
		};

	if (!shot.outcome) return { tone: "ask", text: copy.ask };

	const text = `${action(shot.outcome, shot)}${summary(shot)}`;
	const dark = shot.yours?.cases.some((c) => darkOf(c) > 0.5);

	return { tone: dark ? "miss" : "moved", text };
}

export function planStatus(
	solved: PlanSolved | null,
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
			long: `GLOP solved ${solved.cases.length} power flows: ${variables} variables, ${constraints} constraints in ${time}`,
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
