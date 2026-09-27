"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { loadWorld } from "@/features/capacity/server/actions";
import { ActCard } from "./act-card";
import { type Act, type Next, nextLabel, type Place, stages } from "./acts";
import { money, mw } from "./format";
import {
	askGuess,
	board,
	breakIt,
	changePlay,
	currentTotal,
	cutPower,
	type Game,
	nextGuide,
	nudge,
	pickable,
	pickNode,
	removeRoute,
	resetPlay,
	restart,
	retry,
	reveal,
	setBlocks,
	showView,
	start,
	yours,
} from "./game";
import { GridRound } from "./grid-round";
import { Heading } from "./heading";
import type { Copy } from "./levels";
import { Lines, lineStyle } from "./lines";
import { type Callout, WorldMap } from "./map";
import { Blocks, Controls, Legend, Selection, ViewToggle } from "./panels";
import { matched, type NodeKind } from "./plan";
import { PlanRound } from "./plan-round";
import { useProgress } from "./progress";
import type { GridWorld, Level, PlansWorld, Solved, World } from "./protocol";
import { Score, type ScoreRow } from "./score";
import { keyMove, namer, narrate, status, verdict } from "./script";
import { useSolutions } from "./use-solutions";
import "./capacity.css";

export function CapacityLab() {
	const [loaded, setLoaded] = useState<{
		world: World;
		grid: GridWorld;
		plans: PlansWorld;
	} | null>(null);
	const [down, setDown] = useState(false);
	const [index, setIndex] = useState(0);
	const [seen, setSeen] = useState<Set<Act["id"]>>(() => new Set());
	const { progress, win } = useProgress();

	useEffect(() => {
		loadWorld().then((result) => {
			if (result.ok)
				setLoaded({
					world: result.world,
					grid: result.grid,
					plans: result.plans,
				});
			else setDown(true);
		});
	}, []);

	const stage = stages[index];
	const act = stage.chapter.act;
	const lines = <Lines index={index} progress={progress} onOpen={setIndex} />;
	const card = seen.has(act.id) ? null : (
		<ActCard
			act={act}
			onBegin={() => setSeen((all) => new Set(all).add(act.id))}
		/>
	);
	const label = nextLabel(index);
	const next = label ? { label, run: () => setIndex(index + 1) } : null;

	if (loaded && stage.kind === "plan") {
		const level = loaded.plans.levels.find((l) => l.id === stage.copy.id);
		if (level)
			return (
				<PlanRound
					key={level.id}
					plans={loaded.plans}
					grid={loaded.grid}
					level={level}
					copy={stage.copy}
					place={stage}
					lines={lines}
					card={card}
					onWin={win}
					next={next}
				/>
			);
	}
	if (loaded && stage.kind === "grid") {
		const level = loaded.grid.levels.find((l) => l.id === stage.copy.id);
		if (level)
			return (
				<GridRound
					key={level.id}
					grid={loaded.grid}
					level={level}
					copy={stage.copy}
					place={stage}
					lines={lines}
					card={card}
					onWin={win}
					next={next}
				/>
			);
	}
	const level =
		loaded && stage.kind === "route"
			? loaded.world.levels.find((l) => l.id === stage.copy.id)
			: undefined;
	if (!loaded || !level || stage.kind !== "route")
		return (
			<Waiting
				place={stage}
				title={stage.copy.title}
				down={down}
				lines={lines}
			/>
		);
	return (
		<Round
			key={level.id}
			world={loaded.world}
			level={level}
			copy={stage.copy}
			place={stage}
			lines={lines}
			card={card}
			onWin={win}
			next={next}
		/>
	);
}

function Waiting({
	place,
	title,
	down,
	lines,
}: {
	place: Place;
	title: string;
	down: boolean;
	lines: ReactNode;
}) {
	return (
		<div className="cc" style={lineStyle(place.chapter.line)} data-waiting>
			<div className="cc-stage">
				<div className="cc-map" />
				{lines}
			</div>
			<section className="cc-sheet">
				<div className="cc-say">
					<Heading place={place} title={title} />
					<p className="cc-line">
						{down
							? "The optimizer is not reachable right now."
							: "Loading the world…"}
					</p>
				</div>
				<div className="cc-actions">
					{down ? (
						<button
							type="button"
							className="cc-text-button"
							onClick={() => location.reload()}
						>
							Try again
						</button>
					) : null}
				</div>
			</section>
		</div>
	);
}

interface Action {
	label: string;
	run: () => void;
	disabled?: boolean;
	arrow?: boolean;
}

function scoreRows(
	game: Game,
	mine: { total: number; dropped: number },
	best: Solved | null,
	live: Solved | null,
): ScoreRow[] {
	if (game.phase === "play")
		return [
			{ label: "Before", total: best?.totals.total ?? null, tone: "ink" },
			{ label: "Now", total: live?.totals.total ?? null, tone: "line" },
		];
	return [
		{
			label: "You",
			total: mine.total,
			note: mine.dropped > 0 ? `${mw(mine.dropped)} dropped` : undefined,
			tone: "line",
		},
		{
			label: "Solver",
			total: game.revealed ? (best?.totals.total ?? null) : null,
			tone: "ink",
		},
	];
}

function Round({
	world,
	level,
	copy,
	place,
	lines,
	card,
	onWin,
	next,
}: {
	world: World;
	level: Level;
	copy: Copy;
	place: Place;
	lines: ReactNode;
	card: ReactNode;
	onWin: (id: string) => void;
	next: Next | null;
}) {
	const steps = copy.guide?.length ?? 0;
	const [game, setGame] = useState<Game>(() => start(level, steps));
	const { solutions, pending, failed } = useSolutions(level, game);
	const name = useMemo(() => namer(world), [world]);
	const { best, built, live } = solutions;

	const mine = yours(game, world, level, built);
	const won = !!best && matched(mine.total, best.totals.total);
	const shown = board(game, level, solutions);
	const comparing = game.phase === "solved" || game.phase === "guess";
	const viewingSolver = comparing && game.view === "solver";

	const narration = narrate({
		phase: game.phase,
		step: game.step,
		copy,
		world,
		level,
		outcome: game.outcome,
		yours: mine,
		solved:
			game.phase === "play"
				? live
				: game.phase === "plan" && !game.revealed
					? null
					: best,
		won,
		pick: game.pick,
		edit: game.edit,
	});

	const onPick = (id: string, kind: NodeKind) =>
		setGame((g) =>
			pickNode(
				g,
				{ world, level, before: currentTotal(solutions), name },
				id,
				kind,
			),
		);

	const primary = ((): Action | null => {
		const step = copy.guide?.[game.step];
		if (game.phase === "guide" && step)
			return {
				label: step.action,
				run: () => setGame((g) => nextGuide(g, level, steps)),
			};
		if (game.phase === "intro" && copy.intro)
			return {
				label: copy.intro.action,
				run: () => setGame((g) => cutPower(g, level)),
			};
		if (game.phase === "plan")
			return {
				label: "Ask the solver",
				disabled: !best,
				run: () => {
					setGame(reveal);
					if (won) onWin(level.id);
				},
			};
		if (game.phase === "solved" && copy.guess && !game.pick)
			return { label: "One more question", run: () => setGame(askGuess) };
		if (game.phase === "guess" && !game.pick) return null;
		return next ? { label: next.label, run: next.run, arrow: true } : null;
	})();

	const carbonSource =
		game.phase === "play" ? live : viewingSolver ? best : null;
	const carbon =
		level.carbonCap === null
			? null
			: {
					used: carbonSource?.totals.carbon ?? mine.carbon,
					cap: level.carbonCap,
				};
	const verdictText = comparing
		? verdict(mine.total, best?.totals.total ?? 0, won)
		: game.phase === "play"
			? "Live: every change is a fresh solve."
			: game.revealed
				? "Try to match the solver’s total."
				: "Every dropped megawatt costs $1,400 an hour in lost GPU rent.";

	const callout: Callout | null =
		viewingSolver && best?.key
			? {
					demand: best.key.demand,
					site: best.key.site,
					title: `The move · ${keyMove(world, best.key).route}`,
					body: keyMove(world, best.key).worth,
				}
			: null;
	const upgrades =
		game.phase === "guess" && game.pick && best ? best.upgrades : null;
	const chips = upgrades
		? Object.fromEntries(
				Object.entries(upgrades).map(([s, v]) => [s, `+${money(v)}`]),
			)
		: undefined;
	const topUpgrade = upgrades
		? (Object.entries(upgrades).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
		: null;

	const slot = (() => {
		if (game.phase === "play")
			return (
				<Controls
					play={game.play}
					onChange={(patch, label) =>
						setGame((g) => changePlay(g, patch, label, currentTotal(solutions)))
					}
				/>
			);
		if (comparing)
			return (
				<ViewToggle
					view={game.view}
					onChange={(v) => setGame((g) => showView(g, v))}
				/>
			);
		if (game.phase === "plan" && level.build)
			return (
				<Blocks
					level={level}
					blocks={game.blocks}
					name={name}
					onChange={(b) => setGame((g) => setBlocks(g, b))}
				/>
			);
		if (game.phase === "plan" && game.selected)
			return (
				<Selection
					world={world}
					level={level}
					scene={shown.scene}
					routes={game.routes}
					selected={game.selected}
					name={name}
					onNudge={(d, s, delta) =>
						setGame((g) => nudge(g, world, level, d, s, delta))
					}
					onRemove={(d, s) =>
						setGame((g) => removeRoute(g, world, level, d, s))
					}
				/>
			);
		return <Legend level={level} />;
	})();

	const statusText = status(
		level.build && game.phase === "plan"
			? built
			: game.phase === "play"
				? live
				: best,
		pending,
		failed,
	);

	return (
		<div
			className="cc"
			style={lineStyle(place.chapter.line)}
			data-phase={game.phase}
		>
			<div className="cc-stage">
				<WorldMap
					world={world}
					level={level}
					board={shown}
					pickable={pickable(game, level)}
					chips={chips}
					best={topUpgrade}
					callout={callout}
					onPick={onPick}
				/>
				{lines}
				<p className="cc-limits">
					<span>{shown.scene.latency} ms limit</span>
					{level.carbonCap !== null ? (
						<span>{level.carbonCap} t CO₂ cap</span>
					) : null}
					{level.build ? (
						<span>
							{level.build.blocks} × {level.build.block} MW blocks
						</span>
					) : null}
				</p>
			</div>

			<section className="cc-sheet" aria-label={copy.title}>
				<div className="cc-say">
					<Heading place={place} title={copy.title} status={statusText} />
					<p className="cc-line" data-tone={narration.tone} aria-live="polite">
						{narration.text}
					</p>
				</div>

				<Score
					rows={scoreRows(game, mine, best, live)}
					carbon={carbon}
					verdict={verdictText}
					won={won && comparing}
				/>

				<div className="cc-slot">{slot}</div>

				<div className="cc-actions">
					{game.phase === "plan" && !level.build ? (
						<button
							type="button"
							className="cc-text-button"
							onClick={() => setGame((g) => restart(g, level))}
						>
							Start over
						</button>
					) : null}
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
								onClick={() => setGame((g) => breakIt(g, level))}
							>
								Break it
							</button>
						</>
					) : null}
					{game.phase === "play" ? (
						<button
							type="button"
							className="cc-text-button"
							onClick={() => setGame((g) => resetPlay(g, level))}
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
