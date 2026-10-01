import type { Edit, View } from "./game";
import type {
	GridChoice,
	GridEdits,
	GridFlow,
	GridLevel,
	GridSolved,
	GridWorld,
} from "./protocol";

export type GridPhase =
	| "guide"
	| "plan"
	| "thinking"
	| "solved"
	| "ask"
	| "told"
	| "play";

export type Extreme = "max" | "min";

export interface Script {
	steps: number;
	questions: Extreme[];
}

export interface GridPlay {
	tripped: string[];
	demand: number;
}

export type GridOutcome =
	| { kind: "placed"; campus: string; substation: string }
	| { kind: "built" | "unbuilt" | "opened" | "closed"; line: string };

export interface GridGame {
	phase: GridPhase;
	step: number;
	frame: number;
	question: number;
	picks: string[];
	placement: Record<string, string>;
	campus: string | null;
	built: string[];
	opened: string[];
	outcome: GridOutcome | null;
	revealed: boolean;
	view: View;
	play: GridPlay;
	edit: Edit | null;
}

export interface GridSolutions {
	best: GridSolved | null;
	yours: GridSolved | null;
	preview: GridSolved | null;
	today: GridSolved | null;
	live: GridSolved | null;
}

const NEUTRAL_PLAY: GridPlay = { tripped: [], demand: 1 };

const firstOpen = (level: GridLevel, placement: Record<string, string>) =>
	level.placement
		? null
		: (level.campuses.find((c) => !placement[c.id])?.id ?? null);

const afterGuide = (script: Script): GridPhase =>
	script.questions.length ? "ask" : "plan";

export function startGrid(level: GridLevel, script: Script): GridGame {
	return {
		phase: script.steps > 0 ? "guide" : afterGuide(script),
		step: 0,
		frame: 0,
		question: 0,
		picks: [],
		placement: {},
		campus: firstOpen(level, {}),
		built: [],
		opened: [],
		outcome: null,
		revealed: false,
		view: "solver",
		play: NEUTRAL_PLAY,
		edit: null,
	};
}

export function nextStep(game: GridGame, script: Script): GridGame {
	return game.step + 1 < script.steps
		? { ...game, step: game.step + 1 }
		: { ...game, phase: afterGuide(script) };
}

export function selectCampus(game: GridGame, campus: string): GridGame {
	return { ...game, campus: game.campus === campus ? null : campus };
}

export function pickSubstation(
	game: GridGame,
	level: GridLevel,
	substation: string,
): GridGame {
	if (game.phase === "ask") {
		const picks = [...game.picks];

		picks[game.question] = substation;

		return { ...game, picks, phase: "told" };
	}

	if (game.phase !== "plan" || level.placement || !game.campus) return game;

	const campus = game.campus;
	const placement = { ...game.placement, [campus]: substation };

	return {
		...game,
		placement,
		campus: firstOpen(level, placement),
		outcome: { kind: "placed", campus, substation },
	};
}

const toggle = (list: string[], id: string) =>
	list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

function planLine(game: GridGame, level: GridLevel, line: string): GridGame {
	if (level.candidates.includes(line)) {
		const had = game.built.includes(line);

		const built = had
			? game.built.filter((l) => l !== line)
			: [...game.built, line].slice(-level.maxBuild);

		return {
			...game,
			built,
			outcome: { kind: had ? "unbuilt" : "built", line },
		};
	}

	if (!level.switching) return game;

	const had = game.opened.includes(line);

	return {
		...game,
		opened: toggle(game.opened, line),
		outcome: { kind: had ? "closed" : "opened", line },
	};
}

export interface LineContext {
	grid: GridWorld;
	name: (id: string) => string;
	before: number;
}

export function pickLine(
	game: GridGame,
	level: GridLevel,
	line: string,
	{ grid, name, before }: LineContext,
): GridGame {
	if (game.phase === "plan") return planLine(game, level, line);

	if (game.phase !== "play" || !grid.lines.some((l) => l.id === line))
		return game;

	const back = game.play.tripped.includes(line);

	return {
		...game,
		play: { ...game.play, tripped: toggle(game.play.tripped, line) },
		edit: {
			label: `${name(line)} ${back ? "back in service" : "tripped"}`,
			before,
		},
	};
}

export function complete(game: GridGame, level: GridLevel): boolean {
	return !!level.placement || level.campuses.every((c) => game.placement[c.id]);
}

export function choiceOf(game: GridGame, level: GridLevel): GridChoice {
	return level.placement
		? { built: game.built, opened: game.opened }
		: { placement: game.placement };
}

export function editsOf(game: GridGame): GridEdits {
	return game.play;
}

export function reveal(game: GridGame): GridGame {
	return { ...game, phase: "solved", revealed: true, view: "solver" };
}

export function think(game: GridGame): GridGame {
	return { ...game, phase: "thinking", frame: 0, revealed: true };
}

export function advance(game: GridGame, frames: number): GridGame {
	if (game.phase !== "thinking") return game;

	return game.frame + 1 < frames
		? { ...game, frame: game.frame + 1 }
		: reveal(game);
}

export function nextQuestion(game: GridGame, script: Script): GridGame {
	return game.question + 1 < script.questions.length
		? { ...game, question: game.question + 1, phase: "ask" }
		: game;
}

export function answerOf(
	prices: Record<string, number>,
	extreme: Extreme,
): string | null {
	const ranked = Object.entries(prices).sort((a, b) => a[1] - b[1]);
	const at = extreme === "max" ? ranked.at(-1) : ranked[0];

	return at?.[0] ?? null;
}

export function rightPicks(
	game: GridGame,
	script: Script,
	prices: Record<string, number>,
): boolean[] {
	return script.questions.map(
		(extreme, i) => game.picks[i] === answerOf(prices, extreme),
	);
}

export function retry(game: GridGame): GridGame {
	return { ...game, phase: "plan", outcome: null };
}

export function breakIt(game: GridGame): GridGame {
	return { ...game, phase: "play", edit: null, play: NEUTRAL_PLAY };
}

export function resetPlay(game: GridGame): GridGame {
	return { ...game, edit: null, play: NEUTRAL_PLAY };
}

export function changeDemand(
	game: GridGame,
	demand: number,
	before: number,
): GridGame {
	return {
		...game,
		play: { ...game.play, demand },
		edit: { label: `Demand ×${demand.toFixed(2)}`, before },
	};
}

export function showView(game: GridGame, view: View): GridGame {
	return { ...game, view };
}

export interface Pickable {
	substations: boolean;
	lines: boolean;
}

export function gridPickable(game: GridGame, level: GridLevel): Pickable {
	if (game.phase === "ask") return { substations: true, lines: false };

	if (game.phase === "plan")
		return {
			substations: !level.placement && !!game.campus,
			lines: !!level.placement,
		};

	return { substations: false, lines: game.phase === "play" };
}

export interface GridBoard {
	solved: GridFlow | null;
	solver: boolean;
	tripped: string[];
	focus: string[];
	candidates: Record<string, number> | null;
	prices: Record<string, number> | null;
	limits?: Record<string, number>;
	generators?: Record<string, number>;
}

const blank = {
	solver: false,
	tripped: [],
	focus: [],
	candidates: null,
	prices: null,
};

function toldPrices(
	game: GridGame,
	script: Script,
	prices: Record<string, number>,
): Record<string, number> {
	if (game.question + 1 >= script.questions.length) return prices;

	const shown = new Set(
		script.questions
			.slice(0, game.question + 1)
			.flatMap((extreme, i) => [game.picks[i], answerOf(prices, extreme)]),
	);

	return Object.fromEntries(
		Object.entries(prices).filter(([sub]) => shown.has(sub)),
	);
}

export function gridBoard(
	game: GridGame,
	solutions: GridSolutions,
	script: Script,
	focus: string[] = [],
): GridBoard {
	const { best, yours, preview, live } = solutions;

	switch (game.phase) {
		case "guide":
			return { ...blank, solved: preview ?? yours, focus };
		case "thinking":
			return {
				...blank,
				solved: best?.trace[game.frame]?.flow ?? best,
				solver: true,
			};
		case "ask":
			return { ...blank, solved: yours };
		case "told":
			return {
				...blank,
				solved: yours,
				prices: best ? toldPrices(game, script, best.prices) : null,
			};
		case "play": {
			const now = live ?? best;

			return {
				...blank,
				solved: now,
				solver: true,
				tripped: game.play.tripped,
				prices: script.questions.length && now ? now.prices : null,
			};
		}
		case "solved":
			if (game.view === "solver")
				return {
					...blank,
					solved: best,
					solver: true,
					candidates: best?.candidates ?? null,
				};

			return { ...blank, solved: yours };
		default:
			return { ...blank, solved: yours };
	}
}

export function currentGridTotal(solutions: GridSolutions): number {
	return (solutions.live ?? solutions.best)?.totals.total ?? 0;
}
