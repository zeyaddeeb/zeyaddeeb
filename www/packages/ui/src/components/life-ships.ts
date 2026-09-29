export type Cell = [number, number];

const SHIPS = {
	glider: ["OOO", "..O", ".O."],
	lwss: ["O..O.", "....O", "O...O", ".OOOO"],
	mwss: ["..O...", "O...O.", ".....O", "O....O", ".OOOOO"],
	hwss: ["..OO...", "O....O.", "......O", "O.....O", ".OOOOOO"],
};

export type Ship = keyof typeof SHIPS;

export const PERIOD = 4;

const RESTING = [0, 2];

export const FLEETS = {
	right: ["lwss", "mwss", "hwss"],
	left: ["lwss", "mwss", "hwss"],
	down: ["lwss"],
	up: ["lwss"],
	"up-right": ["glider"],
} satisfies Record<string, Ship[]>;

export type Direction = keyof typeof FLEETS;

const ORIENT: Record<Direction, (r: number, c: number, cols: number) => Cell> =
	{
		right: (r, c) => [r, c],
		left: (r, c, cols) => [r, cols - 1 - c],
		down: (r, c) => [c, r],
		up: (r, c, cols) => [cols - 1 - c, r],
		"up-right": (r, c) => [r, c],
	};

export const key = (r: number, c: number) => `${r},${c}`;

function cells(ship: Ship): Cell[] {
	return SHIPS[ship].flatMap((row, r) =>
		[...row].flatMap((mark, c): Cell[] => (mark === "O" ? [[r, c]] : [])),
	);
}

function step(live: Cell[]): Cell[] {
	const alive = new Set(live.map(([r, c]) => key(r, c)));
	const counts = new Map<string, number>();
	for (const [r, c] of live) {
		for (let dr = -1; dr <= 1; dr++) {
			for (let dc = -1; dc <= 1; dc++) {
				if (!dr && !dc) continue;
				const k = key(r + dr, c + dc);
				counts.set(k, (counts.get(k) ?? 0) + 1);
			}
		}
	}
	const next: Cell[] = [];
	for (const [k, n] of counts) {
		if (n === 3 || (n === 2 && alive.has(k))) {
			const [r, c] = k.split(",").map(Number);
			next.push([r, c]);
		}
	}
	return next;
}

export type Frame = { r: number; c: number; alive: boolean[] };

export type Specimen = {
	ship: Ship;
	phase: number;
	frames: Frame[];
	rows: number;
	cols: number;
};

export const variants = (direction: Direction) =>
	FLEETS[direction].length * RESTING.length;

export function pick(seed: string | number, count: number) {
	if (typeof seed === "number") {
		return ((Math.trunc(seed) % count) + count) % count;
	}
	let hash = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
	}
	hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
	hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
	return ((hash ^ (hash >>> 16)) >>> 0) % count;
}

const specimens = new Map<string, Specimen>();

export function specimen(direction: Direction, index: number): Specimen {
	const id = `${direction}:${index}`;
	const cached = specimens.get(id);
	if (cached) return cached;
	const fleet: Ship[] = FLEETS[direction];
	const ship = fleet[index % fleet.length];
	const phase = RESTING[index % RESTING.length];
	const gens = [cells(ship)];
	for (let g = 0; g < phase + PERIOD; g++) gens.push(step(gens[g]));
	const flight = gens.slice(phase);
	const rest = flight[0];
	const top = Math.min(...rest.map(([r]) => r));
	const left = Math.min(...rest.map(([, c]) => c));
	const height = Math.max(...rest.map(([r]) => r)) - top + 1;
	const width = Math.max(...rest.map(([, c]) => c)) - left + 1;
	const turn = ORIENT[direction];
	const union = new Map<string, Frame>();
	flight.forEach((live, g) => {
		for (const [r, c] of live) {
			const [y, x] = turn(r - top, c - left, width);
			const k = key(y, x);
			let frame = union.get(k);
			if (!frame) {
				frame = {
					r: y,
					c: x,
					alive: new Array<boolean>(flight.length).fill(false),
				};
				union.set(k, frame);
			}
			frame.alive[g] = true;
		}
	});
	const upright = direction === "up" || direction === "down";
	const result = {
		ship,
		phase,
		frames: [...union.values()],
		rows: upright ? width : height,
		cols: upright ? height : width,
	};
	specimens.set(id, result);
	return result;
}
