export const COLS = 18;
export const ROWS = 12;
export const CELLS = COLS * ROWS;
export const RESPAWN = 5;
export const TICKS = RESPAWN + 1;
export const CLOCKS = TICKS ** 3;
export const STAY = 0;

export const MOVES: readonly (readonly [number, number])[] = [
	[0, 0],
	[0, -1],
	[1, -1],
	[1, 0],
	[1, 1],
	[0, 1],
	[-1, 1],
	[-1, 0],
	[-1, -1],
];

export const EAST = 3;

const ART = [
	".....##..........P",
	".o#o.##..........F",
	"..#..##..........F",
	"..o..##..........F",
	".....##..........P",
	"..........##......",
	"..........##.wwww.",
	"..........##.wTTw.",
	"..........##.wTTw.",
	"=D........##.wwww.",
	"..........##......",
	"..xx......##......",
];

export type Kind =
	| "water"
	| "land"
	| "pier"
	| "post"
	| "finish"
	| "rock"
	| "tower"
	| "wall";

const KINDS: Record<string, Kind> = {
	".": "water",
	o: "water",
	D: "water",
	"#": "land",
	"=": "pier",
	P: "post",
	F: "finish",
	x: "rock",
	T: "tower",
	w: "wall",
};

const glyphs = ART.join("");

export const at = (x: number, y: number) => y * COLS + x;

export const xy = (cell: number): [number, number] => [
	cell % COLS,
	Math.floor(cell / COLS),
];

export const kinds: Kind[] = [...glyphs].map((g) => KINDS[g] ?? "water");

const find = (glyph: string) =>
	[...glyphs].flatMap((g, cell) => (g === glyph ? [cell] : []));

export const DOCK = find("D")[0] ?? 0;
export const PIER = find("=");
export const BUOYS = find("o");
export const ROCKS = find("x");
export const FINISH = find("F");
export const TOWER = find("T");
export const WALL = find("w");

export interface Headland {
	x: number;
	y: number;
	wide: number;
	tall: number;
	cap: "north" | "south" | "both";
}

export const HEADLANDS: Headland[] = [
	{ x: 2, y: 1, wide: 1, tall: 2, cap: "both" },
	{ x: 5, y: 0, wide: 2, tall: 5, cap: "south" },
	{ x: 10, y: 5, wide: 2, tall: 7, cap: "north" },
];

export const buoyAt = new Int8Array(CELLS).fill(-1);

BUOYS.forEach((cell, i) => {
	buoyAt[cell] = i;
});

export const ends = (cell: number) =>
	kinds[cell] === "finish" || kinds[cell] === "rock";

const place = (i: number) => TICKS ** i;

export const timer = (clock: number, i: number) =>
	Math.floor(clock / place(i)) % TICKS;

export const clockOf = (timers: readonly number[]) =>
	timers.reduce((clock, t, i) => clock + t * place(i), 0);

export const timersOf = (clock: number) => BUOYS.map((_, i) => timer(clock, i));

export const TICK = Uint8Array.from({ length: CLOCKS }, (_, clock) =>
	clockOf(timersOf(clock).map((t) => Math.max(0, t - 1))),
);

export const UP = BUOYS.map((_, i) =>
	Uint8Array.from({ length: CLOCKS }, (_, clock) =>
		timer(clock, i) === 0 ? 1 : 0,
	),
);

export const STRUCK = BUOYS.map((_, i) =>
	Uint8Array.from(
		{ length: CLOCKS },
		(_, clock) => clock + (RESPAWN - timer(clock, i)) * place(i),
	),
);

export interface Waters {
	reach: boolean;
	open: Uint8Array;
	to: Int16Array;
	nudge: Uint8Array;
	away: Int16Array;
}

function passable(reach: boolean) {
	return Uint8Array.from(kinds, (kind) =>
		kind === "water" ||
		kind === "finish" ||
		kind === "rock" ||
		(kind === "wall" && reach)
			? 1
			: 0,
	);
}

function ahead(cell: number, action: number) {
	const [x, y] = xy(cell);
	const [dx, dy] = MOVES[action] ?? [0, 0];
	const nx = x + dx;
	const ny = y + dy;

	return nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS ? -1 : at(nx, ny);
}

function target(open: Uint8Array, cell: number, action: number) {
	const next = ahead(cell, action);

	if (next < 0 || !open[next]) return -1;

	const [x, y] = xy(cell);
	const [nx, ny] = xy(next);
	const squeezed = nx !== x && ny !== y && !open[at(nx, y)] && !open[at(x, ny)];

	return squeezed ? -1 : next;
}

function distances(open: Uint8Array, to: Int16Array) {
	const away = new Int16Array(CELLS).fill(-1);
	const queue = [...FINISH];

	for (const cell of queue) away[cell] = 0;

	for (let head = 0; head < queue.length; head++) {
		const cell = queue[head] ?? 0;

		for (let action = 1; action < MOVES.length; action++) {
			const back = 1 + ((action + 3) % 8);
			const from = ahead(cell, back);

			if (from < 0 || !open[from] || away[from] >= 0 || ends(from)) continue;
			if (to[from * MOVES.length + action] !== cell) continue;

			away[from] = (away[cell] ?? 0) + 1;
			queue.push(from);
		}
	}

	return away;
}

function chart(reach: boolean): Waters {
	const open = passable(reach);
	const to = new Int16Array(CELLS * MOVES.length);
	const nudge = new Uint8Array(CELLS * MOVES.length);

	for (let cell = 0; cell < CELLS; cell++) {
		for (let action = 0; action < MOVES.length; action++) {
			const next = target(open, cell, action);
			const [dx, dy] = MOVES[action] ?? [0, 0];
			const faced = ahead(cell, action);
			const pushes = dx * dy === 0 && faced >= 0 && kinds[faced] === "tower";

			to[cell * MOVES.length + action] = next < 0 ? cell : next;
			nudge[cell * MOVES.length + action] = reach && pushes ? 1 : 0;
		}
	}

	return { reach, open, to, nudge, away: distances(open, to) };
}

const charts = { walled: chart(false), reached: chart(true) };

export const waters = (reach: boolean) =>
	reach ? charts.reached : charts.walled;

export const sailable = (sea: Waters, cell: number) =>
	sea.open[cell] === 1 && !ends(cell);
