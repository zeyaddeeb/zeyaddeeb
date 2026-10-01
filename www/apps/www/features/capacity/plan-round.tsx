"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Next, Place } from "./acts";
import { money } from "./format";
import { gridNames } from "./grid-levels";
import { type GridCallout, GridMap } from "./grid-map";
import { GridLegend, SearchPanel } from "./grid-panels";
import { Heading } from "./heading";
import { lineStyle } from "./lines";
import { ViewToggle } from "./panels";
import { matched } from "./plan";
import {
	advancePlan,
	cycleStart,
	lockGuess,
	mapView,
	nextPlanStep,
	type PlanGame,
	type PlanScript,
	planBoard,
	retryPlan,
	revealPlan,
	scheduleOf,
	setDraft,
	setRental,
	setSize,
	showCase,
	shownPlan,
	showPlan,
	startPlan,
	thinkPlan,
	toggleOpen,
} from "./plan-game";
import { type PlanCopy, type PlanNames, planNames } from "./plan-levels";
import { CaseTabs, GuessSlider, ProjectPanel } from "./plan-panels";
import { planNarrate, planStatus } from "./plan-script";
import type {
	GridWorld,
	PlanLevel,
	PlanSolved,
	PlansWorld,
	Project,
} from "./protocol";
import { Score, type ScoreRow } from "./score";
import { verdict } from "./script";
import { usePlanSolutions } from "./use-plan-solutions";

const STEP_MS = 1100;

interface Action {
	label: string;
	run: () => void;
	disabled?: boolean;
	arrow?: boolean;
}

const scoreOf = (level: PlanLevel, solved: PlanSolved | null) =>
	solved ? (level.objective === "worst" ? solved.worst : solved.total) : null;

function reducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function callout(
	level: PlanLevel,
	solved: PlanSolved | null,
	names: PlanNames,
): GridCallout | null {
	const key = solved?.key;

	if (!key) return null;

	const project = names.project(key.project);
	const when =
		key.period === null ? "" : ` in ${names.period(level, key.period)}`;

	if (key.kind === "open")
		return {
			target: key.project,
			title: `The move · open ${names.name(key.project)}${when}`,
			body: `Keep it closed and the plan costs ${money(key.worth)} more an hour`,
		};

	if (key.kind === "rent")
		return {
			target: project?.target ?? key.project,
			title: `The move · ${names.projectName(key.project).toLowerCase()}`,
			body: `Without turbines the best plan costs ${money(key.worth)} more an hour`,
		};

	return {
		target: project?.target ?? key.project,
		title: `The move · ${names.projectName(key.project)}${when}`,
		body: `Start it a year later and the plan costs ${money(key.worth)} more an hour`,
	};
}

export function PlanRound({
	plans,
	grid,
	level,
	copy,
	place,
	lines,
	card,
	onWin,
	next,
}: {
	plans: PlansWorld;
	grid: GridWorld;
	level: PlanLevel;
	copy: PlanCopy;
	place: Place;
	lines: ReactNode;
	card: ReactNode;
	onWin: (id: string) => void;
	next: Next | null;
}) {
	const script: PlanScript = useMemo(
		() => ({ steps: copy.guide.length, guessing: !!copy.guess }),
		[copy],
	);

	const [game, setGame] = useState<PlanGame>(() => startPlan(level, script));
	const { solutions, pending, failed } = usePlanSolutions(level, game);
	const names = useMemo(() => planNames(plans, gridNames(grid)), [plans, grid]);
	const { best, yours } = solutions;
	const frames = best?.trace.length ?? 0;

	const projects = level.projects
		.map((id) => names.project(id))
		.filter((p): p is Project => !!p);

	useEffect(() => {
		if (game.phase !== "thinking") return;

		const timer = setTimeout(
			() => setGame((g) => advancePlan(g, frames)),
			STEP_MS,
		);

		return () => clearTimeout(timer);
	}, [game.phase, frames]);

	const context =
		best && (game.phase === "solved" || game.phase === "told")
			? { ...names, plans, level, solved: best, yours }
			: null;

	const answer =
		copy.guess && best
			? copy.guess.answer({ ...names, plans, level, solved: best, yours })
			: 0;

	const mine = scoreOf(level, yours);
	const bestScore = scoreOf(level, best);

	const won = copy.guess
		? game.guess !== null && Math.abs(game.guess - answer) <= answer * 0.25
		: mine !== null && bestScore !== null && matched(mine, bestScore);

	useEffect(() => {
		if (copy.guess && game.phase === "told" && won) onWin(level.id);
	}, [copy.guess, game.phase, won, onWin, level.id]);

	const shown = shownPlan(game, solutions);
	const result = shown.cases.find((c) => c.case === game.view);

	const shownSchedule =
		game.phase === "thinking"
			? (best?.trace[game.frame]?.schedule ?? scheduleOf(game, level))
			: shown.solver && shown.solved
				? shown.solved.schedule
				: scheduleOf(game, level);

	const view = mapView(level, plans, grid, shownSchedule, result, game.view);

	const board = planBoard(result, shown.solver, {
		limits: view.limits,
		generators: view.generators,
	});

	const narration = planNarrate({
		phase: game.phase,
		step: game.step,
		frame: game.frame,
		copy,
		level,
		names,
		outcome: game.outcome,
		context,
		yours,
		best,
		won,
		guess: game.guess,
	});

	const step = game.phase === "guide" ? copy.guide[game.step] : undefined;

	const primary = ((): Action | null => {
		if (game.phase === "guide" && step)
			return {
				label: step.action,
				run: () =>
					setGame((g) =>
						nextPlanStep(g, script, copy.guide[g.step + 1]?.view ?? step.view),
					),
			};

		if (game.phase === "plan")
			return {
				label: "Ask the solver",
				disabled: !best,
				run: () => {
					const replay = frames > 1 && !reducedMotion();

					setGame((g) => (replay ? thinkPlan(g) : revealPlan(g)));

					if (won) onWin(level.id);
				},
			};

		if (game.phase === "thinking")
			return { label: "Skip", run: () => setGame(revealPlan) };

		if (game.phase === "guess")
			return {
				label: "Lock in my guess",
				disabled: !best,
				run: () => setGame(lockGuess),
			};

		return next ? { label: next.label, run: next.run, arrow: true } : null;
	})();

	const comparing = game.phase === "solved";
	const trace = game.phase === "thinking" ? best?.trace[game.frame] : null;

	const rows: ScoreRow[] = copy.guess
		? [
				{
					label: "Guess",
					total: game.phase === "told" ? game.guess : null,
					tone: "line",
				},
				{
					label: "Worth",
					total: game.phase === "told" ? answer : null,
					tone: "ink",
				},
			]
		: [
				{ label: "You", total: mine, tone: "line" },
				{
					label: trace ? "SCIP" : "Solver",
					total: trace ? trace.total : game.revealed ? bestScore : null,
					floor: trace?.bound,
					tone: "ink",
				},
			];

	const unit =
		level.objective === "worst"
			? "Scored on the most expensive future."
			: level.periods === 1
				? "Each future weighted by its odds."
				: "Averaged over the hours of 2027 to 2030.";

	const verdictText = trace
		? `Replaying SCIP’s search: node ${trace.nodes}.`
		: comparing && mine !== null && bestScore !== null
			? verdict(mine, bestScore, won)
			: unit;

	const scale =
		trace && bestScore !== null
			? Math.max(mine ?? 0, bestScore) * 1.6
			: undefined;

	const slot = (() => {
		if (game.phase === "thinking" && best)
			return <SearchPanel trace={best.trace} frame={game.frame} />;

		if (comparing)
			return (
				<ViewToggle
					view={game.show}
					onChange={(v) => setGame((g) => showPlan(g, v))}
				/>
			);

		if (game.phase === "guess" && copy.guess)
			return (
				<GuessSlider
					value={game.draft}
					max={copy.guess.max}
					step={copy.guess.step}
					onChange={(n) => setGame((g) => setDraft(g, n))}
				/>
			);

		if (game.phase === "plan")
			return (
				<ProjectPanel
					level={level}
					game={game}
					names={names}
					projects={projects}
					onCycle={(p) => setGame((g) => cycleStart(g, level, p))}
					onSize={(p, n) => setGame((g) => setSize(g, p, n))}
					onRent={(p, n) => setGame((g) => setRental(g, p, g.view, n))}
				/>
			);

		return <GridLegend />;
	})();

	const statusSolved =
		game.phase === "plan" && !game.revealed
			? yours
			: game.phase === "guide"
				? null
				: best;

	const rush = level.rentals
		.map((id) => names.project(id))
		.find((p) => p?.id.startsWith("rush-"));

	return (
		<div
			className="cc"
			style={lineStyle(place.chapter.line)}
			data-phase={game.phase}
			data-slot="tall"
		>
			<div className="cc-stage">
				<GridMap
					grid={grid}
					level={view.level}
					board={board}
					pickable={{
						substations: false,
						lines: game.phase === "plan" && level.switching,
					}}
					placement={view.level.placement ?? {}}
					selected={null}
					tabbed
					callout={
						comparing && game.show === "solver"
							? callout(level, best, names)
							: null
					}
					onSubstation={() => {}}
					onLine={(id) =>
						setGame((g) =>
							toggleOpen(
								g,
								level,
								id,
								grid.lines.some((l) => l.id === id),
							),
						)
					}
				/>
				{lines}
				<CaseTabs
					level={level}
					view={game.view}
					results={shown.cases}
					onShow={(id) => setGame((g) => showCase(g, id))}
				/>
				<p className="cc-limits">
					{level.periods > 1 ? (
						<span>
							{level.crews} crew · {level.periods} starts
						</span>
					) : null}
					{rush ? <span>Rush: {rush.blocks} blocks max</span> : null}
				</p>
			</div>

			<section className="cc-sheet" aria-label={copy.title}>
				<div className="cc-say">
					<Heading
						place={place}
						title={copy.title}
						status={planStatus(statusSolved, pending, failed)}
					/>
					<p className="cc-line" data-tone={narration.tone} aria-live="polite">
						{narration.text}
					</p>
				</div>

				<Score
					rows={rows}
					carbon={null}
					verdict={verdictText}
					won={won && (comparing || game.phase === "told")}
					scale={scale}
				/>

				<div className="cc-slot">{slot}</div>

				<div className="cc-actions">
					{comparing && !won ? (
						<button
							type="button"
							className="cc-text-button"
							onClick={() => setGame(retryPlan)}
						>
							Try to match it
						</button>
					) : null}
					{primary ? (
						<button
							type="button"
							className="cc-primary"
							onClick={primary.run}
							disabled={primary.disabled}
						>
							{primary.label}
							{primary.arrow ? (
								<span aria-hidden="true">
									<LifeArrow direction="right" />
								</span>
							) : null}
						</button>
					) : null}
				</div>
			</section>
			{card}
		</div>
	);
}
