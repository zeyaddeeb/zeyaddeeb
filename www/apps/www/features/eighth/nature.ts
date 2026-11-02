export const AGREE = [1, 0.75, 0.25, 0, 0.25, 0.75] as const;
export const BUCKETS = [0, 30, 60, 90] as const;
export const NATURE = [1, 0.75, 0.25, 0] as const;
export const CEILING = 2 / 3;

const BUCKET_OF = [0, 1, 2, 3, 2, 1] as const;

export type Random = () => number;

export function step(from: number, to: number) {
	return (((to - from) % 6) + 6) % 6;
}

export function bucket(from: number, to: number) {
	return BUCKET_OF[step(from, to)];
}

export function follow(random: Random, s: number, other: boolean) {
	return random() < AGREE[((s % 6) + 6) % 6] ? other : !other;
}

export function pair(random: Random, first: number, second: number) {
	const a = random() < 0.5;

	return [a, follow(random, step(first, second), a)] as const;
}
