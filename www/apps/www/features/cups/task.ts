export const CUPS = 5;
export const MOST = 60;
export const CHANCE = 1 / CUPS;

export const PAIRS: readonly (readonly [number, number])[] = [
	[0, 1],
	[0, 2],
	[0, 3],
	[0, 4],
	[1, 2],
	[1, 3],
	[1, 4],
	[2, 3],
	[2, 4],
	[3, 4],
];

export const cupToken = (cup: number) => cup;
export const swapToken = (pair: number) => CUPS + pair;

export function pairOf(a: number, b: number) {
	const lo = Math.min(a, b);
	const hi = Math.max(a, b);

	return PAIRS.findIndex(([x, y]) => x === lo && y === hi);
}

export function after(ball: number, pair: number) {
	const [a, b] = PAIRS[pair] ?? [0, 0];

	if (ball === a) return b;
	if (ball === b) return a;

	return ball;
}

export function trail(start: number, swaps: readonly number[]) {
	let ball = start;

	return swaps.map((pair) => {
		ball = after(ball, pair);
		return ball;
	});
}

export function randomPair(random: () => number = Math.random) {
	return Math.min(PAIRS.length - 1, Math.floor(random() * PAIRS.length));
}

export function randomCup(random: () => number = Math.random) {
	return Math.min(CUPS - 1, Math.floor(random() * CUPS));
}

export function argmax(values: ArrayLike<number>) {
	let best = 0;

	for (let i = 1; i < values.length; i++) {
		if ((values[i] ?? 0) > (values[best] ?? 0)) best = i;
	}

	return best;
}

export function shuffleOrder(order: readonly number[], pair: number) {
	const [a, b] = PAIRS[pair] ?? [0, 0];
	const next = [...order];
	const held = next[a] ?? a;

	next[a] = next[b] ?? b;
	next[b] = held;

	return next;
}
