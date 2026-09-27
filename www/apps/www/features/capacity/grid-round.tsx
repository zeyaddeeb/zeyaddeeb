"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Next, Place } from "./acts";
import { money, ms, mw } from "./format";
import {
	advance,
	answerOf,
	breakIt,
	changeDemand,
	complete,
	currentGridTotal,
	type GridGame,
	gridBoard,
	gridPickable,
	nextQuestion,
	nextStep,
	pickLine,
	pickSubstation,
	resetPlay,
	retry,
	reveal,
	rightPicks,
	type Script,
	selectCampus,
	showView,
	startGrid,
	think,
} from "./grid-game";
import { dark, type GridCopy, gridNames, perMwh } from "./grid-levels";
import { type GridCallout, GridMap } from "./grid-map";
import {
	CampusPicker,
	GridControls,
	GridLegend,
	PriceLegend,
	SearchPanel,
	WirePanel,
} from "./grid-panels";
import { gridNarrate, gridStatus } from "./grid-script";
import { Heading } from "./heading";
import { lineStyle } from "./lines";
import { ViewToggle } from "./panels";
import { matched } from "./plan";
import type { GridLevel, GridSolved, GridWorld } from "./protocol";
import { Score, type ScoreRow } from "./score";
import { verdict } from "./script";
import { useGridSolutions } from "./use-grid-solutions";

const STEP_MS = 1100;

interface Action {
	label: string;
	run: () => void;
	disabled?: boolean;
	arrow?: boolean;
}

function planRows(
	game: GridGame,
	ready: boolean,
	yours: GridSolved | null,
	best: GridSolved | null,
	live: GridSolved | null,
): ScoreRow[] {
	if (game.phase === "play")
		return [
			{ label: "Before", total: best?.totals.total ?? null, tone: "ink" },
			{ label: "Now", total: live?.totals.total ?? null, tone: "line" },
		];
	const out = yours ? dark(yours) : 0;
	const step = game.phase === "thinking" ? best?.trace[game.frame] : null;
	return [
		{
			label: "You",
			total: ready && yours ? yours.totals.total : null,
			note: ready && out > 0 ? `${mw(Math.round(out))} dark` : undefined,
			tone: "line",
		},
		{
			label: step ? "SCIP" : "Solver",
			total: step
				? step.total
				: game.revealed
					? (best?.totals.total ?? null)
					: null,
			floor: step?.bound,
			tone: "ink",
		},
	];
}

function quizRows(
	game: GridGame,
	script: Script,
	prices: Record<string, number>,
): ScoreRow[] {
	const told = game.phase === "told" || game.phase === "play";
	const extreme = script.questions[game.question] ?? "max";
	const pick = game.picks[game.question];
	const answer = answerOf(prices, extreme);
	return [
		{
			label: "Pick",
			total: told && pick ? (prices[pick] ?? null) : null,
			tone: "line",
			format: perMwh,
		},
		{
			label: "Answer",
			total: told && answer ? (prices[answer] ?? null) : null,
			tone: "ink",
			format: perMwh,
		},
	];
}

function reducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

export function GridRound({
	grid,
	level,
	copy,
	place,
	lines,
	card,
	onWin,
	next,
}: {
	grid: GridWorld;
	level: GridLevel;
	copy: GridCopy;
	place: Place;
	lines: ReactNode;
	card: ReactNode;
	onWin: (id: string) => void;
	next: Next | null;
}) {
	const script: Script = useMemo(
		() => ({
			steps: copy.guide.length,
			questions: copy.questions?.map((q) => q.extreme) ?? [],
		}),
		[copy],
	);
	const [game, setGame] = useState<GridGame>(() => startGrid(level, script));
	const step = game.phase === "guide" ? copy.guide[game.step] : undefined;
	const { solutions, pending, failed } = useGridSolutions(
		level,
		game,
		step?.preview,
	);
	const names = useMemo(() => gridNames(grid), [grid]);
	const { best, yours, live, today } = solutions;
	const frames = best?.trace.length ?? 0;
	const quiz = script.questions.length > 0;
	const lastQuestion = game.question === script.questions.length - 1;
	const prices = best?.prices ?? {};

	useEffect(() => {
		if (game.phase !== "thinking") return;
		const timer = setTimeout(() => setGame((g) => advance(g, frames)), STEP_MS);
		return () => clearTimeout(timer);
	}, [game.phase, frames]);

	const ready = complete(game, level);
	const won = quiz
		? game.phase === "told" &&
			lastQuestion &&
			rightPicks(game, script, prices).every(Boolean)
		: ready &&
			!!best &&
			!!yours &&
			matched(yours.totals.total, best.totals.total);

	useEffect(() => {
		if (quiz && won) onWin(level.id);
	}, [quiz, won, onWin, level.id]);

	const shown = gridBoard(game, solutions, script, step?.focus);
	const comparing = game.phase === "solved";
	const viewingSolver = comparing && game.view === "solver";

	const narration = gridNarrate({
		phase: game.phase,
		step: game.step,
		copy,
		grid,
		level,
		names,
		outcome: game.outcome,
		complete: ready,
		yours,
		best,
		live,
		guide: { grid, level, shown: shown.solved, today, ...names },
		revealed: game.revealed,
		won,
		edit: game.edit,
		frame: game.frame,
		question: game.question,
		picks: game.picks,
		script,
	});

	const primary = ((): Action | null => {
		if (game.phase === "guide" && step)
			return {
				label: step.action,
				run: () => setGame((g) => nextStep(g, script)),
			};
		if (game.phase === "plan")
			return {
				label: "Ask the solver",
				disabled: !best || !ready,
				run: () => {
					const replay = frames > 1 && !reducedMotion();
					setGame((g) => (replay ? think(g) : reveal(g)));
					if (won) onWin(level.id);
				},
			};
		if (game.phase === "thinking")
			return { label: "Skip", run: () => setGame(reveal) };
		if (game.phase === "ask") return null;
		if (game.phase === "told" && !lastQuestion)
			return {
				label: "Next question",
				run: () => setGame((g) => nextQuestion(g, script)),
			};
		return next ? { label: next.label, run: next.run, arrow: true } : null;
	})();

	const key = viewingSolver ? best?.key : null;
	const callout: GridCallout | null = key
		? key.kind === "site" && key.campus && key.substation
			? {
					target: key.substation,
					title: `The move · ${mw(level.campuses.find((c) => c.id === key.campus)?.mw ?? 0)} → ${names.name(key.substation)}`,
					body: `Force it onto ${names.name(level.lure?.[1] ?? "")}’s cheap land and the best plan costs ${money(key.worth)} more an hour`,
				}
			: key.line
				? {
						target: key.line,
						title: `The move · open ${names.name(key.line)}`,
						body: `Close it again and the plan costs ${money(key.worth)} more an hour`,
					}
				: null
		: null;

	const before = currentGridTotal(solutions);
	const lineContext = { grid, name: names.name, before };
	const slot = (() => {
		if (game.phase === "play")
			return (
				<GridControls
					play={game.play}
					onDemand={(d) => setGame((g) => changeDemand(g, d, before))}
				/>
			);
		if (game.phase === "thinking" && best)
			return <SearchPanel trace={best.trace} frame={game.frame} />;
		if (comparing)
			return (
				<ViewToggle
					view={game.view}
					onChange={(v) => setGame((g) => showView(g, v))}
				/>
			);
		if (quiz) return <PriceLegend />;
		if (game.phase === "plan" && !level.placement)
			return (
				<CampusPicker
					level={level}
					placement={game.placement}
					selected={game.campus}
					names={names}
					onSelect={(c) => setGame((g) => selectCampus(g, c))}
				/>
			);
		if (game.phase === "plan")
			return (
				<WirePanel
					built={game.built}
					opened={game.opened}
					names={names}
					onToggle={(l) => setGame((g) => pickLine(g, level, l, lineContext))}
				/>
			);
		return <GridLegend />;
	})();

	const statusSolved =
		game.phase === "play"
			? live
			: game.phase === "plan" && !game.revealed
				? yours
				: game.phase === "guide"
					? null
					: best;
	const trace = game.phase === "thinking" ? best?.trace[game.frame] : null;
	const verdictText = (() => {
		if (trace)
			return `Replaying SCIP’s search: node ${trace.nodes}, ${ms(trace.ms)} in.`;
		if (quiz) {
			if (game.phase === "play")
				return "Live: every change re-prices the grid.";
			if (game.phase !== "told")
				return "One guess each. Prices appear once you pick.";
			const pick = game.picks[game.question];
			const answer = answerOf(prices, script.questions[game.question]);
			if (!pick || !answer) return "";
			return pick === answer
				? "Right on."
				: `Off by ${perMwh(Math.abs((prices[pick] ?? 0) - (prices[answer] ?? 0)))} a megawatt-hour.`;
		}
		if (comparing)
			return verdict(yours?.totals.total ?? 0, best?.totals.total ?? 0, won);
		if (game.phase === "play") return "Live: every change is a fresh solve.";
		return "Every dark megawatt costs $1,400 an hour in lost GPU rent.";
	})();
	const rows = quiz
		? quizRows(game, script, prices)
		: planRows(game, ready, yours, best, live);
	const scale =
		trace && best
			? Math.max(yours?.totals.total ?? 0, best.totals.total) * 1.6
			: undefined;
	const hub = grid.hubs.find((h) => level.hubCapacity[h.id]);

	return (
		<div
			className="cc"
			style={lineStyle(place.chapter.line)}
			data-phase={game.phase}
		>
			<div className="cc-stage">
				<GridMap
					grid={grid}
					level={level}
					board={shown}
					pickable={gridPickable(game, level)}
					placement={level.placement ?? game.placement}
					selected={game.phase === "plan" ? game.campus : null}
					rings={
						game.phase === "told" ? game.picks.slice(0, game.question + 1) : []
					}
					callout={callout}
					onSubstation={(id) => setGame((g) => pickSubstation(g, level, id))}
					onLine={(id) => setGame((g) => pickLine(g, level, id, lineContext))}
				/>
				{lines}
				<p className="cc-limits">
					{hub ? (
						<span>
							{hub.name} {mw(level.hubCapacity[hub.id])}
						</span>
					) : (
						<span>+{level.campuses.reduce((a, c) => a + c.mw, 0)} MW</span>
					)}
					{level.maxBuild ? (
						<span>
							{level.maxBuild} new line{level.maxBuild > 1 ? "s" : ""}
						</span>
					) : null}
				</p>
			</div>

			<section className="cc-sheet" aria-label={copy.title}>
				<div className="cc-say">
					<Heading
						place={place}
						title={copy.title}
						status={gridStatus(statusSolved, pending, failed)}
					/>
					<p className="cc-line" data-tone={narration.tone} aria-live="polite">
						{narration.text}
					</p>
				</div>

				<Score
					rows={rows}
					carbon={null}
					verdict={verdictText}
					won={won && (comparing || quiz)}
					scale={scale}
				/>

				<div className="cc-slot">{slot}</div>

				<div className="cc-actions">
					{comparing ? (
						<>
							{won ? null : (
								<button
									type="button"
									className="cc-text-button"
									onClick={() => setGame(retry)}
								>
									Try to match it
								</button>
							)}
							<button
								type="button"
								className="cc-text-button"
								onClick={() => setGame(breakIt)}
							>
								Break it
							</button>
						</>
					) : null}
					{game.phase === "told" && lastQuestion ? (
						<button
							type="button"
							className="cc-text-button"
							onClick={() => setGame(breakIt)}
						>
							Break it
						</button>
					) : null}
					{game.phase === "play" ? (
						<button
							type="button"
							className="cc-text-button"
							onClick={() => setGame(resetPlay)}
						>
							Reset
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
