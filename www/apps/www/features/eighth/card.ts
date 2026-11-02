export const DIALS = 6;
export const ANGLES = [0, 30, 60, 90, 120, 150] as const;
export const ORDER = [7, 6, 4, 0, 1, 3, 5, 2] as const;
export const FIG_5A = 3;
export const FIG_5C = 5;

export type CardId = (typeof ORDER)[number];

export function dot(card: number, dial: number) {
	const d = ((dial % DIALS) + DIALS) % DIALS;
	const black = ((card >> (d % 3)) & 1) === 1;

	return d < 3 ? black : !black;
}

export function dots(card: number) {
	return ANGLES.map((_, dial) => dot(card, dial));
}

export function striped(card: number) {
	return dot(card, 0) !== dot(card, 1) && dot(card, 1) !== dot(card, 2);
}

export function agreement(card: number, step: number) {
	let same = 0;

	for (let dial = 0; dial < DIALS; dial++)
		if (dot(card, dial) === dot(card, dial + step)) same++;

	return same / DIALS;
}

export function fromBase(base: [boolean, boolean, boolean]) {
	return base.reduce((id, black, i) => id | (Number(black) << i), 0);
}

export function pin(
	base: [boolean, boolean, boolean],
	dial: number,
	black: boolean,
) {
	const d = ((dial % DIALS) + DIALS) % DIALS;

	base[d % 3] = d < 3 ? black : !black;
}
