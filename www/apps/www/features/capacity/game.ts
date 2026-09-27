import {
	fromSolved,
	fromStart,
	kindOf,
	type Metrics,
	measure,
	type NodeKind,
	type Outcome,
	type Routes,
	type Scene,
	sceneOf,
	step,
	tap,
	totalBlocks,
} from "./plan";
import type { Level, Solved, World } from "./protocol";

export type Phase = "intro" | "plan" | "solved" | "guess" | "play";
export type View = "solver" | "yours";

export interface Play {
	offline: string[];
	latency: number;
	demand: number;
}

export interface Edit {
	label: string;
	before: number;
}

export interface Game {
	phase: Phase;
	routes: Routes;
	outcome: Outcome | null;
	selected: string | null;
	cut: boolean;
	blocks: Record<string, number>;
	revealed: boolean;
	view: View;
	pick: string | null;
	play: Play;
	edit: Edit | null;
}

export interface Solutions {
	best: Solved | null;
	built: Solved | null;
	live: Solved | null;
}

const ALL_KINDS: NodeKind[] = ["site", "city", "training"];

const neutralPlay = (level: Level): Play => ({
	offline: [],
	latency: level.latency,
	demand: 1,
});

const morningPlan = (level: Level, cut: boolean): Routes =>
	level.outage ? fromStart(level, cut ? [level.outage] : []) : {};

export function start(level: Level): Game {
	return {
		phase: level.outage ? "intro" : "plan",
		routes: morningPlan(level, false),
		outcome: null,
		selected: null,
		cut: false,
		blocks: {},
		revealed: false,
		view: "solver",
		pick: null,
		play: neutralPlay(level),
		edit: null,
	};
}

function planScene(game: Game, level: Level): Scene {
	return sceneOf(level, game.cut && level.outage ? [level.outage] : []);
}

function playScene(game: Game, level: Level): Scene {
	const base = sceneOf(level, [
		...game.play.offline,
		...(level.outage ? [level.outage] : []),
	]);
	const scale = (mw: number) => mw * game.play.demand;
	return {
		...base,
		latency: game.play.latency,
		demand: Object.fromEntries(
			Object.entries(base.demand).map(([city, mw]) => [city, scale(mw)]),
		),
		training: scale(base.training),
	};
}

export function cutPower(game: Game, level: Level): Game {
	return {
		...game,
		phase: "plan",
		cut: true,
		routes: morningPlan(level, true),
		outcome: null,
	};
}

export function restart(game: Game, level: Level): Game {
	return { ...game, routes: morningPlan(level, game.cut), outcome: null };
}

function route(
	game: Game,
	world: World,
	level: Level,
	demand: string,
	site: string,
): Game {
	const result = tap(world, planScene(game, level), game.routes, demand, site);
	return { ...game, routes: result.routes, outcome: result.outcome };
}

export function removeRoute(
	game: Game,
	world: World,
	level: Level,
	demand: string,
	site: string,
): Game {
	return route(game, world, level, demand, site);
}

export function nudge(
	game: Game,
	world: World,
	level: Level,
	demand: string,
	site: string,
	delta: number,
): Game {
	const result = step(
		world,
		planScene(game, level),
		game.routes,
		demand,
		site,
		delta,
	);
	return result
		? { ...game, routes: result.routes, outcome: result.outcome }
		: game;
}

function select(
	game: Game,
	world: World,
	level: Level,
	id: string,
	kind: NodeKind,
): Game {
	const current = game.selected;
	const sameSide =
		current !== null &&
		(kindOf(level, current) === "site") === (kind === "site");
	if (current === id) return { ...game, selected: null };
	if (current === null || sameSide) return { ...game, selected: id };
	const [demand, site] = kind === "site" ? [current, id] : [id, current];
	return route(game, world, level, demand, site);
}

function placeBlock(game: Game, level: Level, site: string): Game {
	const room = (level.build?.blocks ?? 0) - totalBlocks(game.blocks);
	if (room <= 0 || !level.capacity[site]) return game;
	return {
		...game,
		blocks: { ...game.blocks, [site]: (game.blocks[site] ?? 0) + 1 },
		outcome: null,
	};
}

function toggleOffline(
	game: Game,
	site: string,
	label: string,
	before: number,
): Game {
	const offline = game.play.offline.includes(site);
	return {
		...game,
		edit: { label: `${label} ${offline ? "back online" : "offline"}`, before },
		play: {
			...game.play,
			offline: offline
				? game.play.offline.filter((s) => s !== site)
				: [...game.play.offline, site],
		},
	};
}

export interface PickContext {
	world: World;
	level: Level;
	before: number;
	name: (id: string) => string;
}

export function pickNode(
	game: Game,
	{ world, level, before, name }: PickContext,
	id: string,
	kind: NodeKind,
): Game {
	switch (game.phase) {
		case "guess":
			return kind === "site" && !game.pick ? { ...game, pick: id } : game;
		case "play":
			return kind === "site" ? toggleOffline(game, id, name(id), before) : game;
		case "plan":
			return level.build
				? placeBlock(game, level, id)
				: select(game, world, level, id, kind);
		default:
			return game;
	}
}

export function setBlocks(game: Game, blocks: Record<string, number>): Game {
	return { ...game, blocks };
}

export function reveal(game: Game): Game {
	return {
		...game,
		phase: "solved",
		revealed: true,
		view: "solver",
		selected: null,
	};
}

export function retry(game: Game): Game {
	return { ...game, phase: "plan", outcome: null };
}

export function askGuess(game: Game): Game {
	return { ...game, phase: "guess" };
}

export function breakIt(game: Game, level: Level): Game {
	return {
		...game,
		phase: "play",
		selected: null,
		edit: null,
		play: neutralPlay(level),
	};
}

export function resetPlay(game: Game, level: Level): Game {
	return { ...game, edit: null, play: neutralPlay(level) };
}

export function changePlay(
	game: Game,
	patch: Partial<Play>,
	label: string,
	before: number,
): Game {
	return { ...game, edit: { label, before }, play: { ...game.play, ...patch } };
}

export function showView(game: Game, view: View): Game {
	return { ...game, view };
}

export function pickable(game: Game, level: Level): NodeKind[] {
	if (game.phase === "plan") return level.build ? ["site"] : ALL_KINDS;
	if (game.phase === "guess" || game.phase === "play") return ["site"];
	return [];
}

export function yours(
	game: Game,
	world: World,
	level: Level,
	built: Solved | null,
): Metrics {
	const cost = level.build
		? totalBlocks(game.blocks) * level.build.block * level.build.cost
		: 0;
	const routes = level.build && built ? fromSolved(built) : game.routes;
	return measure(world, planScene(game, level), routes, cost);
}

export interface Board {
	scene: Scene;
	routes: Routes;
	ghost: Routes | null;
	solver: boolean;
	blocks: Record<string, number>;
	selected: string | null;
	keyMove: Solved["key"];
}

export function board(game: Game, level: Level, solutions: Solutions): Board {
	const { best, built, live } = solutions;
	const comparing = game.phase === "solved" || game.phase === "guess";
	if (game.phase === "play" && live)
		return {
			scene: playScene(game, level),
			routes: fromSolved(live),
			ghost: null,
			solver: true,
			blocks: live.build,
			selected: null,
			keyMove: live.key,
		};
	const mine = level.build && built ? fromSolved(built) : game.routes;
	if (comparing && best && game.view === "solver")
		return {
			scene: planScene(game, level),
			routes: fromSolved(best),
			ghost: mine,
			solver: true,
			blocks: best.build,
			selected: null,
			keyMove: best.key,
		};
	return {
		scene: planScene(game, level),
		routes: mine,
		ghost: null,
		solver: false,
		blocks: game.blocks,
		selected: game.phase === "plan" && !level.build ? game.selected : null,
		keyMove: null,
	};
}

export function currentTotal(solutions: Solutions): number {
	return (solutions.live ?? solutions.best)?.totals.total ?? 0;
}
