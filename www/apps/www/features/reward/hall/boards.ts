export const SIDE = 3;
export const CELLS = SIDE * SIDE;
export const ARRANGEMENTS = 362_880;
export const EVERY = ARRANGEMENTS / 2;
export const HOME = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 0);
export const NEAR = Uint8Array.of(1, 2, 3, 4, 5, 6, 8, 7, 0);

const WEIGHTS = [40_320, 5040, 720, 120, 24, 6, 2, 1, 1];

const NEXT = Array.from({ length: CELLS }, (_, cell) => {
	const col = cell % SIDE;

	return [
		cell - SIDE,
		cell + SIDE,
		col > 0 ? cell - 1 : -1,
		col < SIDE - 1 ? cell + 1 : -1,
	].filter((to) => to >= 0 && to < CELLS);
});

export function rank(cells: ArrayLike<number>) {
	let code = 0;

	for (let i = 0; i < CELLS; i++) {
		const here = cells[i] ?? 0;
		let below = 0;

		for (let j = i + 1; j < CELLS; j++) if ((cells[j] ?? 0) < here) below++;

		code += below * (WEIGHTS[i] ?? 1);
	}

	return code;
}

export function slide(cells: Uint8Array, to: number) {
	const gap = cells.indexOf(0);

	cells[gap] = cells[to] ?? 0;
	cells[to] = 0;

	return gap;
}

export function odd(cells: ArrayLike<number>) {
	let crossed = 0;

	for (let i = 0; i < CELLS; i++)
		for (let j = i + 1; j < CELLS; j++) {
			const a = cells[i] ?? 0;
			const b = cells[j] ?? 0;

			if (a && b && a > b) crossed++;
		}

	return crossed % 2 === 1;
}

export function mend(cells: ArrayLike<number>) {
	return Uint8Array.from(cells, (tile) =>
		tile === 7 ? 8 : tile === 8 ? 7 : tile,
	);
}

export interface Atlas {
	depth: Int8Array;
	order: Int32Array;
	reached: number;
	deepest: number;
}

let drawn: Atlas | null = null;

export function atlas(): Atlas {
	if (drawn) return drawn;

	const depth = new Int8Array(ARRANGEMENTS).fill(-1);
	const order = new Int32Array(ARRANGEMENTS).fill(-1);
	const codes = new Int32Array(EVERY);
	const boards = new Uint8Array(EVERY * CELLS);
	const cells = new Uint8Array(CELLS);
	const start = rank(HOME);
	let head = 0;
	let tail = 0;
	let deepest = 0;

	depth[start] = 0;
	order[start] = 0;
	codes[0] = start;
	boards.set(HOME, 0);
	tail = 1;

	while (head < tail) {
		cells.set(boards.subarray(head * CELLS, head * CELLS + CELLS));
		deepest = depth[codes[head++] ?? 0] ?? 0;

		const gap = cells.indexOf(0);
		const reach = NEXT[gap] ?? [];

		for (let i = 0; i < reach.length; i++) {
			const to = reach[i] ?? 0;

			cells[gap] = cells[to] ?? 0;
			cells[to] = 0;

			const next = rank(cells);

			if (depth[next] === -1) {
				depth[next] = deepest + 1;
				order[next] = tail;
				codes[tail] = next;
				boards.set(cells, tail * CELLS);
				tail++;
			}

			cells[to] = cells[gap] ?? 0;
			cells[gap] = 0;
		}
	}

	drawn = { depth, order, reached: tail, deepest };

	return drawn;
}

export function way(from: ArrayLike<number>) {
	const { depth } = atlas();
	const cells = Uint8Array.from(from);
	const moves: number[] = [];
	let left = depth[rank(cells)] ?? -1;

	while (left > 0) {
		const gap = cells.indexOf(0);
		const to = (NEXT[gap] ?? []).find((cell) => {
			slide(cells, cell);

			const closer = depth[rank(cells)] === left - 1;

			slide(cells, gap);

			return closer;
		});

		if (to === undefined) break;

		slide(cells, to);
		moves.push(to);
		left--;
	}

	return moves;
}
