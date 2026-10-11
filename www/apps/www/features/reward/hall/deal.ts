import { atlas, CELLS, mend, odd, rank } from "./boards";

export const ROOMS = 898;
export const STUCK = 198;

const SEED = 20_260_711;
const SHALLOW = 8;

export interface Room {
	dealt: Uint8Array;
	sound: Uint8Array;
	stuck: boolean;
	found: number;
	depth: number;
}

export interface Hall {
	rooms: Room[];
	stuck: number[];
	able: Int32Array;
	every: Int32Array;
}

function mulberry(seed: number) {
	let state = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;

		let mixed = Math.imul(state ^ (state >>> 15), state | 1);

		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);

		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
}

function shuffle<T extends { [index: number]: number; length: number }>(
	list: T,
	random: () => number,
) {
	for (let i = list.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const held = list[i] ?? 0;

		list[i] = list[j] ?? 0;
		list[j] = held;
	}

	return list;
}

function scramble(random: () => number) {
	const { depth } = atlas();

	for (;;) {
		const cells = shuffle(
			Uint8Array.from({ length: CELLS }, (_, i) => i),
			random,
		);
		const sound = odd(cells) ? mend(cells) : cells;

		if ((depth[rank(sound)] ?? 0) >= SHALLOW) return sound;
	}
}

const sorted = (rooms: Room[]) =>
	Int32Array.from(rooms, (room) => room.found).sort();

function build(): Hall {
	const { depth, order } = atlas();
	const random = mulberry(SEED);
	const picked = new Set(
		shuffle(
			Array.from({ length: ROOMS }, (_, i) => i),
			random,
		).slice(0, STUCK),
	);
	const rooms = Array.from({ length: ROOMS }, (_, i): Room => {
		const sound = scramble(random);
		const code = rank(sound);
		const stuck = picked.has(i);

		return {
			dealt: stuck ? mend(sound) : sound,
			sound,
			stuck,
			found: (order[code] ?? 0) + 1,
			depth: depth[code] ?? 0,
		};
	});

	return {
		rooms,
		stuck: rooms.flatMap((room, i) => (room.stuck ? [i] : [])),
		able: sorted(rooms.filter((room) => !room.stuck)),
		every: sorted(rooms),
	};
}

let hall: Hall | null = null;

export function dealt() {
	hall ??= build();

	return hall;
}

export function foundBy(founds: Int32Array, clock: number) {
	let low = 0;
	let high = founds.length;

	while (low < high) {
		const mid = (low + high) >> 1;

		if ((founds[mid] ?? 0) <= clock) low = mid + 1;
		else high = mid;
	}

	return low;
}
