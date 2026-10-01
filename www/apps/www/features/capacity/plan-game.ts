import type { View } from "./game";
import type { GridBoard } from "./grid-game";
import type {
	CaseResult,
	GridLevel,
	GridWorld,
	PlanLevel,
	PlanSolved,
	PlansWorld,
	Project,
	Schedule,
} from "./protocol";

export type PlanPhase =
	| "guide"
	| "plan"
	| "thinking"
	| "solved"
	| "guess"
	| "told";

export type PlanOutcome =
	| { kind: "start"; project: string; period: number | null }
	| { kind: "size"; project: string; count: number }
	| { kind: "rent"; project: string; case: string; blocks: number }
	| { kind: "open" | "close"; line: string; case: string };

export interface Start {
	period: number;
	count: number;
}

export interface PlanGame {
	phase: PlanPhase;
	step: number;
	frame: number;
	view: string;
	starts: Record<string, Start>;
	rentals: Record<string, number>;
	opened: string[];
	outcome: PlanOutcome | null;
	revealed: boolean;
	show: View;
	draft: number;
	guess: number | null;
}

export interface PlanScript {
	steps: number;
	guessing: boolean;
}

export interface PlanSolutions {
	best: PlanSolved | null;
	yours: PlanSolved | null;
}

const slot = (a: string, b: string) => `${a}|${b}`;

const afterGuide = (script: PlanScript): PlanPhase =>
	script.guessing ? "guess" : "plan";

export function startPlan(level: PlanLevel, script: PlanScript): PlanGame {
	return {
		phase: script.steps > 0 ? "guide" : afterGuide(script),
		step: 0,
		frame: 0,
		view: level.cases[0]?.id ?? "",
		starts: {},
		rentals: {},
		opened: [],
		outcome: null,
		revealed: false,
		show: "solver",
		draft: 0,
		guess: null,
	};
}

export function nextPlanStep(
	game: PlanGame,
	script: PlanScript,
	view?: string,
): PlanGame {
	const moved = view ? { ...game, view } : game;

	return game.step + 1 < script.steps
		? { ...moved, step: game.step + 1 }
		: { ...moved, phase: afterGuide(script) };
}

export function showCase(game: PlanGame, view: string): PlanGame {
	return { ...game, view };
}

const size = (project: Project) =>
	project.kind === "turbine" ? 0 : Math.max(1, project.blocks);

function crewUsed(game: PlanGame, period: number, except: string): number {
	return Object.entries(game.starts)
		.filter(([p, s]) => p !== except && s.period === period)
		.reduce((a, [, s]) => a + s.count, 0);
}

export function cycleStart(
	game: PlanGame,
	level: PlanLevel,
	project: string,
): PlanGame {
	if (game.phase !== "plan") return game;

	const current = game.starts[project]?.period ?? -1;
	const free = (t: number) => crewUsed(game, t, project) < level.crews;

	const next = Array.from(
		{ length: level.periods },
		(_, i) => current + 1 + i,
	).find((t) => t < level.periods && free(t));

	const { [project]: _, ...rest } = game.starts;

	const starts =
		next === undefined
			? rest
			: { ...rest, [project]: { period: next, count: 1 } };

	return {
		...game,
		starts,
		outcome: { kind: "start", project, period: next ?? null },
	};
}

export function setSize(
	game: PlanGame,
	project: Project,
	count: number,
): PlanGame {
	if (game.phase !== "plan") return game;

	const clamped = Math.max(0, Math.min(size(project), count));
	const { [project.id]: _, ...rest } = game.starts;

	return {
		...game,
		starts: clamped
			? { ...rest, [project.id]: { period: 0, count: clamped } }
			: rest,
		outcome: { kind: "size", project: project.id, count: clamped },
	};
}

export function setRental(
	game: PlanGame,
	project: Project,
	caseId: string,
	blocks: number,
): PlanGame {
	if (game.phase !== "plan") return game;

	const clamped = Math.max(0, Math.min(project.blocks, blocks));
	const key = slot(project.id, caseId);
	const { [key]: _, ...rest } = game.rentals;

	return {
		...game,
		rentals: clamped ? { ...rest, [key]: clamped } : rest,
		outcome: {
			kind: "rent",
			project: project.id,
			case: caseId,
			blocks: clamped,
		},
	};
}

export function toggleOpen(
	game: PlanGame,
	level: PlanLevel,
	line: string,
	existing: boolean,
): PlanGame {
	if (game.phase !== "plan" || !level.switching || !existing) return game;

	const key = slot(line, game.view);
	const had = game.opened.includes(key);

	return {
		...game,
		opened: had ? game.opened.filter((k) => k !== key) : [...game.opened, key],
		outcome: { kind: had ? "close" : "open", line, case: game.view },
	};
}

export function rentalOf(
	game: PlanGame,
	project: string,
	caseId: string,
): number {
	return game.rentals[slot(project, caseId)] ?? 0;
}

export function scheduleOf(game: PlanGame, level: PlanLevel): Schedule {
	return {
		starts: Object.entries(game.starts)
			.filter(([p]) => level.projects.includes(p))
			.map(([project, s]) => ({ project, period: s.period, count: s.count })),
		rentals: level.recourse
			? []
			: Object.entries(game.rentals).map(([key, blocks]) => {
					const [project, caseId] = key.split("|");

					return { project, case: caseId, blocks };
				}),
		opened: game.opened.map((key) => {
			const [line, caseId] = key.split("|");

			return { line, case: caseId };
		}),
	};
}

export function revealPlan(game: PlanGame): PlanGame {
	return { ...game, phase: "solved", revealed: true, show: "solver" };
}

export function thinkPlan(game: PlanGame): PlanGame {
	return { ...game, phase: "thinking", frame: 0, revealed: true };
}

export function advancePlan(game: PlanGame, frames: number): PlanGame {
	if (game.phase !== "thinking") return game;

	return game.frame + 1 < frames
		? { ...game, frame: game.frame + 1 }
		: revealPlan(game);
}

export function retryPlan(game: PlanGame): PlanGame {
	return { ...game, phase: "plan", outcome: null };
}

export function showPlan(game: PlanGame, show: View): PlanGame {
	return { ...game, show };
}

export function setDraft(game: PlanGame, draft: number): PlanGame {
	return game.phase === "guess" ? { ...game, draft } : game;
}

export function lockGuess(game: PlanGame): PlanGame {
	return game.phase === "guess"
		? { ...game, phase: "told", guess: game.draft, revealed: true }
		: game;
}

export function shownPlan(
	game: PlanGame,
	solutions: PlanSolutions,
): { solved: PlanSolved | null; cases: CaseResult[]; solver: boolean } {
	const { best, yours } = solutions;

	if (game.phase === "thinking") {
		const step = best?.trace[game.frame];

		return {
			solved: best,
			cases: step?.cases ?? best?.cases ?? [],
			solver: true,
		};
	}

	if (game.phase === "solved" && game.show === "solver")
		return { solved: best, cases: best?.cases ?? [], solver: true };

	if (game.phase === "told")
		return { solved: best, cases: best?.cases ?? [], solver: true };

	return { solved: yours, cases: yours?.cases ?? [], solver: false };
}

export function activeIn(
	schedule: Schedule,
	project: Project,
	period: number,
): number {
	return schedule.starts
		.filter(
			(s) => s.project === project.id && s.period + project.lead <= period,
		)
		.reduce((a, s) => a + s.count, 0);
}

export interface MapView {
	level: GridLevel;
	limits: Record<string, number>;
	generators: Record<string, number>;
}

export function mapView(
	level: PlanLevel,
	plans: PlansWorld,
	grid: GridWorld,
	schedule: Schedule,
	result: CaseResult | undefined,
	caseId: string,
): MapView {
	const planCase = level.cases.find((c) => c.id === caseId) ?? level.cases[0];

	const campuses = planCase.campuses.map(([sub, mw], i) => ({
		id: `${sub}${i}`,
		mw,
		sub,
	}));

	const project = (id: string) => plans.projects.find((p) => p.id === id);
	const projects = level.projects.map(project).filter((p): p is Project => !!p);
	const hubCapacity: Record<string, number> = {};
	const limits: Record<string, number> = {};
	const generators: Record<string, number> = {};

	const add = (sub: string, mw: number) => {
		generators[sub] = (generators[sub] ?? 0) + mw;
	};

	for (const p of projects) {
		const active = activeIn(schedule, p, planCase.period);

		if (!active) continue;

		if (p.kind === "hub") {
			const base = grid.hubs.find((h) => h.id === p.target)?.capacity ?? 0;

			hubCapacity[p.target] = base + p.mw * active;
		}

		if (p.kind === "upgrade") {
			const base = grid.lines.find((l) => l.id === p.target)?.limit ?? 0;

			limits[p.target] = base + p.mw * active;
		}

		if (p.kind === "plant") add(p.target, p.mw * active);
	}

	for (const [rid, blocks] of Object.entries(result?.rentals ?? {})) {
		const r = project(rid);

		if (r) add(r.target, r.mw * blocks);
	}

	return {
		level: {
			id: level.id,
			campuses: campuses.map(({ id, mw }) => ({ id, mw })),
			placement: Object.fromEntries(campuses.map((c) => [c.id, c.sub])),
			candidates: projects
				.filter((p) => p.kind === "line")
				.map((p) => p.target),
			maxBuild: 0,
			switching: level.switching,
			lure: null,
			hubCapacity,
			prices: false,
		},
		limits,
		generators,
	};
}

export function planBoard(
	flow: CaseResult | undefined,
	solver: boolean,
	extra: Pick<GridBoard, "limits" | "generators">,
): GridBoard {
	return {
		solved: flow?.flow ?? null,
		solver,
		tripped: [],
		focus: [],
		candidates: null,
		prices: null,
		...extra,
	};
}
