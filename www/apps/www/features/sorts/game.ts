import { sheet } from "./pages";
import {
	alphabet,
	type Kind,
	kinds,
	type Placed,
	type Sort,
	touches,
	widthOf,
} from "./sorts";

export const MIN_COLS = 44;
export const ROWS = 49;
export const PITCH = 7;
export const SLOTS = 6;
export const FLOOR = SLOTS * PITCH;
export const MARGIN = 1;
export const STEP = 1 / 120;
export const SET = 0.06;
export const FEED = 0.42;
export const RELOAD = 0.2;
export const LOOSEN = 0.5;
export const AIMED = 0.22;
export const MERCY = 1.6;
export const TURN = 1.8;
export const LIVES = 3;

const GAP = 1;
const SPACE = 3;
const TRACK = [0, 0.25, 0.5, 0.25];
const LOOSEST = 0.5;
const TICK = 0.6;
const SHOT = 46;
const WALK = 22;
const GRAVITY = 34;
const REACH = 2.5;
const BUFFER = 0.15;
const KNOCK = 10;
const CATCH = 5;
const PAGE = 100;

export type Phase = "idle" | "play" | "turn" | "over";
export type Ending = "room" | "dots";
export type Event = "knock" | "catch" | "hit" | "feed" | "page" | "over";

export interface Loose {
	sort: Sort;
	at: number;
	tittle: boolean;
}

export interface Letter {
	char: string;
	base: number;
	before: number;
	order: number;
	sorts: Sort[];
	loose: Loose[];
}

export interface Line {
	text: string;
	slot: number;
	from: number;
	set: number;
	dir: number;
	beat: number;
	width: number;
	gaps: number;
	letters: Letter[];
}

export interface Falling extends Placed {
	vy: number;
	tittle: boolean;
}

export interface Pace {
	feed: number;
	slide: number;
	shed: number;
	aim: number;
	drop: number;
}

export interface Game {
	cols: number;
	phase: Phase;
	ending: Ending | null;
	t: number;
	rest: number;
	run: number;
	pace: Pace;
	queue: string[];
	lines: Line[];
	fed: number;
	falling: Falling[];
	shot: { x: number; y: number } | null;
	trigger: number;
	x: number;
	loaded: number;
	mercy: number;
	lives: number;
	score: number;
	knocked: Record<Kind, number>;
	turned: number;
	seed: number;
	still: boolean;
}

export interface Input {
	move: number;
	target: number | null;
}

export interface Spot {
	line: Line;
	letter: Letter;
	x: number;
	y: number;
	age: number;
	shown: boolean;
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const ease = (value: number) => {
	const c = clamp(value, 0, 1);

	return c * c * (3 - 2 * c);
};

export function paceOf(run: number): Pace {
	return {
		feed: Math.max(3.4, 8.5 - 0.6 * run),
		slide: 1.5 + 0.4 * run,
		shed: 0.08 + 0.035 * run,
		aim: 0.7 + 0.15 * run,
		drop: 14 + 0.8 * run,
	};
}

function random(game: Game) {
	game.seed = (game.seed + 0x6d2b79f5) | 0;

	let r = Math.imul(game.seed ^ (game.seed >>> 15), 1 | game.seed);

	r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;

	return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

export function typeset(
	text: string,
	slot: number,
	set: number,
	dir = 0,
	beat = 0,
): Line {
	const letters: Letter[] = [];
	let cursor = 0;
	let gaps = 0;

	text.split(" ").forEach((word, wi) => {
		if (wi > 0) {
			cursor += SPACE;
			gaps += 1;
		}

		[...word].forEach((char, ci) => {
			if (ci > 0) {
				cursor += GAP;
				gaps += 1;
			}

			letters.push({
				char,
				base: cursor,
				before: gaps,
				order: letters.length,
				sorts: (alphabet[char] ?? []).map((sort) => ({ ...sort })),
				loose: [],
			});
			cursor += widthOf(char);
		});
	});

	return {
		text,
		slot,
		from: slot * PITCH,
		set,
		dir,
		beat,
		width: cursor,
		gaps,
		letters,
	};
}

export const widest = (line: Line) => line.width + line.gaps * LOOSEST;

export function tracking(line: Line, t: number, still: boolean) {
	if (still) return 0;

	const k = Math.max(0, t / TICK + line.beat);
	const i = Math.floor(k);
	const from = TRACK[(i + TRACK.length - 1) % TRACK.length] ?? 0;
	const to = TRACK[i % TRACK.length] ?? 0;

	return from + (to - from) * ease((k - i) / 0.3);
}

export function lineY(game: Game, line: Line) {
	const to = line.slot * PITCH;

	if (game.still) return to;

	return line.from + (to - line.from) * ease((game.t - game.fed) / FEED);
}

export function lineX(game: Game, line: Line, tau: number) {
	const room = widest(line);
	const travel = Math.max(0, game.cols - 2 * MARGIN - room);
	const p =
		travel > 0
			? line.dir + ((game.t - line.set) * game.pace.slide) / travel
			: 0;
	const m = ((p % 2) + 2) % 2;

	return (
		MARGIN +
		travel * (1 - Math.abs(m - 1)) +
		(room - (line.width + line.gaps * tau)) / 2
	);
}

export function layout(game: Game) {
	const spots: Spot[] = [];

	for (const line of game.lines) {
		const tau = tracking(line, game.t, game.still);
		const x0 = lineX(game, line, tau);
		const y = lineY(game, line);

		for (const letter of line.letters) {
			const age = game.t - line.set - (game.still ? 0 : letter.order * SET);

			spots.push({
				line,
				letter,
				x: x0 + letter.base + letter.before * tau,
				y,
				age,
				shown: age >= 0,
			});
		}
	}

	return spots;
}

export const placeOf = (spot: Spot, sort: Sort): Placed => ({
	kind: sort.kind,
	rot: sort.rot,
	x: spot.x + sort.x,
	y: spot.y + sort.y,
});

export function player(game: Game): Placed[] {
	const parts: Placed[] = [{ kind: "short", rot: 0, x: game.x, y: FLOOR + 2 }];

	if (loaded(game)) parts.push({ kind: "dot", rot: 0, x: game.x, y: FLOOR });

	return parts;
}

export const loaded = (game: Game) => !game.shot && game.t >= game.loaded;

const zero = () =>
	Object.fromEntries(kinds.map((kind) => [kind, 0])) as Record<Kind, number>;

function push(game: Game, text: string | undefined) {
	if (!text) return;

	game.lines.push(
		typeset(text, 0, game.t, game.queue.length % 2, random(game) * 4),
	);
}

function open(game: Game, run: number) {
	const { lines } = sheet(run);

	game.run = run;
	game.pace = paceOf(run);
	game.queue = lines.slice(1);
	game.lines = [];
	game.fed = game.t;
	push(game, lines[0]);
}

export function create(seed: number, cols = MIN_COLS, still = false): Game {
	const game: Game = {
		cols: Math.max(MIN_COLS, Math.floor(cols)),
		phase: "idle",
		ending: null,
		t: 0,
		rest: 0,
		run: 0,
		pace: paceOf(0),
		queue: [],
		lines: [],
		fed: 0,
		falling: [],
		shot: null,
		trigger: -1,
		x: Math.floor(Math.max(MIN_COLS, cols) / 2),
		loaded: 0,
		mercy: 0,
		lives: LIVES,
		score: 0,
		knocked: zero(),
		turned: 0,
		seed,
		still,
	};

	open(game, 0);

	return game;
}

export function resize(game: Game, cols: number) {
	game.cols = Math.max(MIN_COLS, Math.floor(cols));
	game.x = clamp(game.x, 0, game.cols - 1);
}

export function start(game: Game) {
	if (game.phase !== "idle") return;

	game.phase = "play";
	game.fed = game.t;
}

export function pull(game: Game) {
	game.trigger = game.t + BUFFER;
}

function walk(game: Game, input: Input) {
	const top = game.cols - 1;

	if (input.target !== null) {
		const gap = clamp(input.target, 0, top) - game.x;

		game.x += Math.sign(gap) * Math.min(Math.abs(gap), WALK * STEP);
	} else {
		game.x = clamp(game.x + input.move * WALK * STEP, 0, top);
	}
}

function fire(game: Game) {
	if (game.trigger < game.t || !loaded(game)) return;

	game.shot = { x: game.x + 0.5, y: FLOOR + 0.5 };
	game.trigger = -1;
}

function spent(game: Game) {
	game.shot = null;
	game.loaded = game.t + RELOAD;
}

function struck(spots: Spot[], ball: Placed) {
	for (const spot of spots) {
		if (!spot.shown) continue;

		for (let i = spot.letter.sorts.length - 1; i >= 0; i--) {
			const sort = spot.letter.sorts[i];

			if (sort && touches(ball, placeOf(spot, sort))) return { spot, sort };
		}
	}

	return null;
}

function drop(game: Game, spot: Spot, sort: Sort, vy: number, tittle: boolean) {
	const { letter } = spot;

	letter.sorts = letter.sorts.filter((item) => item !== sort);
	letter.loose = letter.loose.filter((item) => item.sort !== sort);
	game.falling.push({ ...placeOf(spot, sort), vy, tittle });
}

function fly(game: Game, spots: Spot[], events: Event[]) {
	const shot = game.shot;

	if (!shot) return;

	shot.y -= SHOT * STEP;

	const ball: Placed = {
		kind: "dot",
		rot: 0,
		x: shot.x - 0.5,
		y: shot.y - 0.5,
	};

	const caught = game.falling.findIndex((item) => touches(ball, item));

	if (caught >= 0) {
		game.falling.splice(caught, 1);
		game.score += CATCH;
		events.push("catch");
		spent(game);

		return;
	}

	const hit = struck(spots, ball);

	if (hit) {
		drop(game, hit.spot, hit.sort, 0, false);
		game.knocked[hit.sort.kind] += 1;
		game.score += KNOCK;
		events.push("knock");
		spent(game);

		return;
	}

	if (shot.y < -1) spent(game);
}

function finish(game: Game, ending: Ending, events: Event[]) {
	game.phase = "over";
	game.ending = ending;
	game.shot = null;
	events.push("over");
}

function feed(game: Game, events: Event[]) {
	if (game.t - game.fed < game.pace.feed) return;

	game.fed = game.t;

	for (const line of game.lines) {
		line.from = line.slot * PITCH;
		line.slot += 1;
	}

	push(game, game.queue.shift());
	events.push("feed");

	if (game.lines.some((line) => line.slot >= SLOTS))
		finish(game, "room", events);
}

const holds = (letter: Letter, sort: Sort) =>
	letter.loose.some((item) => item.sort === sort);

function loosen(game: Game, spots: Spot[]) {
	const ready = spots.filter(
		(spot) => spot.shown && spot.letter.sorts.length > spot.letter.loose.length,
	);

	if (ready.length && random(game) < game.pace.shed * STEP) {
		const spot = ready[Math.floor(random(game) * ready.length)];
		const free = spot?.letter.sorts.filter((sort) => !holds(spot.letter, sort));
		const sort = free?.[Math.floor(random(game) * free.length)];

		if (spot && sort)
			spot.letter.loose.push({ sort, at: game.t, tittle: false });
	}

	const centre = game.x + 0.5;

	for (const spot of spots) {
		const { letter } = spot;

		if (!spot.shown || (letter.char !== "i" && letter.char !== "j")) continue;

		const dot = letter.sorts.find((sort) => sort.kind === "dot");

		if (!dot || holds(letter, dot)) continue;

		if (Math.abs(spot.x + dot.x + 0.5 - centre) > REACH) continue;

		if (random(game) < game.pace.aim * STEP)
			letter.loose.push({ sort: dot, at: game.t, tittle: true });
	}
}

function detach(game: Game, spots: Spot[]) {
	for (const spot of spots) {
		for (const item of [...spot.letter.loose]) {
			if (game.t - item.at < (item.tittle ? AIMED : LOOSEN)) continue;

			drop(
				game,
				spot,
				item.sort,
				item.tittle ? game.pace.drop : 2,
				item.tittle,
			);
		}
	}
}

function fall(game: Game, events: Event[]) {
	const body = player(game);

	game.falling = game.falling.filter((item) => {
		if (!item.tittle) item.vy += GRAVITY * STEP;

		item.y += item.vy * STEP;

		if (item.y > ROWS) return false;

		if (
			game.phase !== "play" ||
			game.t < game.mercy ||
			!body.some((part) => touches(part, item))
		)
			return true;

		game.lives -= 1;
		game.mercy = game.t + MERCY;
		events.push("hit");

		if (game.lives <= 0) finish(game, "dots", events);

		return false;
	});
}

function tidy(game: Game, events: Event[]) {
	for (const line of game.lines)
		line.letters = line.letters.filter((letter) => letter.sorts.length);

	game.lines = game.lines.filter((line) => line.letters.length);

	if (game.phase !== "play" || game.queue.length || game.lines.length) return;

	game.phase = "turn";
	game.turned = game.t;
	game.score += PAGE;
	game.falling = [];
	game.shot = null;
	game.loaded = game.t;
	events.push("page");
}

function tick(game: Game, input: Input, events: Event[]) {
	game.t += STEP;

	if (game.phase === "over") return;

	if (game.phase === "turn") {
		if (game.t - game.turned < TURN) return;

		open(game, game.run + 1);
		game.phase = "play";
	}

	walk(game, input);

	if (game.phase !== "play") return;

	const spots = layout(game);

	fire(game);
	fly(game, spots, events);
	feed(game, events);

	if (game.phase !== "play") return;

	loosen(game, spots);
	detach(game, spots);
	fall(game, events);
	tidy(game, events);
}

export function step(game: Game, input: Input, dt: number) {
	const events: Event[] = [];

	game.rest = Math.min(game.rest + dt, 0.25);

	while (game.rest >= STEP) {
		game.rest -= STEP;
		tick(game, input, events);
	}

	return events;
}

export function snapshot(game: Game) {
	const { page, impression } = sheet(game.run);

	return {
		phase: game.phase,
		ending: game.ending,
		run: game.run,
		score: game.score,
		lives: game.lives,
		page,
		impression,
		knocked: { ...game.knocked },
	};
}

export type Snapshot = ReturnType<typeof snapshot>;
