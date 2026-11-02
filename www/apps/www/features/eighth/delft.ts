import type { Random } from "./nature";

export const DELFT = {
	trials: 245,
	wins: 196,
	metres: 1280,
	lightUs: 4.27,
	randomUs: 0.16,
	choiceUs: 0.48,
	readoutUs: 3.7,
	hours: 220,
	s: 2.42,
	sError: 0.2,
	p: 0.039,
} as const;

export const RING_CEILING = 0.75;
export const RING_NATURE = (2 + Math.SQRT2) / 4;

export const PAIRS = [
	[0, 0],
	[0, 1],
	[1, 0],
	[1, 1],
] as const;

const COUNTS: Record<string, [number, number, number, number]> = {
	"0,0": [23, 3, 4, 23],
	"0,1": [33, 11, 5, 30],
	"1,0": [22, 10, 6, 24],
	"1,1": [4, 20, 21, 6],
};

export interface Shot {
	a: 0 | 1;
	b: 0 | 1;
	x: boolean;
	y: boolean;
}

const OUTCOMES = [
	[true, true],
	[true, false],
	[false, true],
	[false, false],
] as const;

export function shots(): Shot[] {
	return PAIRS.flatMap(([a, b]) =>
		(COUNTS[`${a},${b}`] ?? [0, 0, 0, 0]).flatMap((n, i) => {
			const [x, y] = OUTCOMES[i] ?? [true, true];

			return Array.from({ length: n }, () => ({ a, b, x, y }));
		}),
	);
}

export function shuffled(random: Random) {
	const all = shots();

	for (let i = all.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const swap = all[i];

		if (swap && all[j]) [all[i], all[j]] = [all[j], swap];
	}

	return all;
}

export function wins(shot: Shot) {
	return shot.a === 1 && shot.b === 1 ? shot.x !== shot.y : shot.x === shot.y;
}

export function tally(list: readonly Shot[]) {
	const n = list.length;
	const won = list.filter(wins).length;
	const rate = n ? won / n : null;
	const perPair = PAIRS.map(([a, b]) => {
		const here = list.filter((s) => s.a === a && s.b === b);

		return here.length ? here.filter(wins).length / here.length : null;
	});
	const correlations = PAIRS.map(([a, b]) => {
		const here = list.filter((s) => s.a === a && s.b === b);

		return here.length
			? here.reduce((sum, s) => sum + (s.x === s.y ? 1 : -1), 0) / here.length
			: 0;
	});
	const [c00, c01, c10, c11] = correlations as [number, number, number, number];

	return {
		n,
		won,
		rate,
		error: rate === null || n < 2 ? null : Math.sqrt((rate * (1 - rate)) / n),
		perPair,
		s: c00 + c01 + c10 - c11,
	};
}

export function leastNegative(rate: number) {
	return Math.max(0, rate / RING_CEILING - 1);
}
