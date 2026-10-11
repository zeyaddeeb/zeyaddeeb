import { ROOMS } from "./deal";
import { DOORS } from "./trial";

export const COLS = 48;
export const ROWS = 32;
export const INSET = 7;
export const HALL = { x: 1, y: 2, cols: 38, rows: 25 };
export const SHELF = { x: 1, y: 27.7, wide: 38, tall: 1.5 };
export const LOCK = { x: 39.25, y: 27.7, side: 1.5 };
export const WALL = { x: 0.55, y: 1.55, wide: 38.9, tall: 28.1 };
export const BLOCK = { x: 41.7, y: 8, cols: 5, pitch: 1.15 };

const framed = (col: number, row: number) => col < INSET && row < INSET;

const open = Array.from({ length: HALL.cols * HALL.rows }, (_, cell) => cell)
	.filter((cell) => !framed(cell % HALL.cols, Math.floor(cell / HALL.cols)))
	.slice(0, ROOMS);

export const SEATS = Int16Array.from(open);

export const SEATED = (() => {
	const rooms = new Int16Array(HALL.cols * HALL.rows).fill(-1);

	SEATS.forEach((cell, room) => {
		rooms[cell] = room;
	});

	return rooms;
})();

export const seat = (room: number): [number, number] => {
	const cell = SEATS[room] ?? 0;

	return [cell % HALL.cols, Math.floor(cell / HALL.cols)];
};

export function roomAt(x: number, y: number) {
	const col = Math.floor(x - HALL.x);
	const row = Math.floor(y - HALL.y);

	if (col < 0 || row < 0 || col >= HALL.cols || row >= HALL.rows) return -1;

	return SEATED[row * HALL.cols + col] ?? -1;
}

export const BLOCK_ROWS = Math.ceil(DOORS / BLOCK.cols);

export const door = (index: number): [number, number] => {
	const row = BLOCK_ROWS - 1 - Math.floor(index / BLOCK.cols);

	return [
		BLOCK.x + (index % BLOCK.cols) * BLOCK.pitch,
		BLOCK.y + row * BLOCK.pitch,
	];
};
