import { agreement, FIG_5A, ORDER, striped } from "./card";
import type { Random } from "./nature";

export const MOST = 9;

export type Deck = readonly number[];

export const EMPTY: Deck = Array.from({ length: 8 }, () => 0);

const build = (count: (card: number) => number): Deck =>
	EMPTY.map((_, card) => count(card));

export const PRESETS = [
	{
		id: "fig-5a",
		label: "Feynman’s card",
		deck: build((card) => (card === FIG_5A ? 1 : 0)),
	},
	{ id: "all", label: "One of each", deck: build(() => 1) },
	{
		id: "nature",
		label: "Minus one eighth",
		deck: build((card) => (striped(card) ? -1 : 3)),
	},
] as const;

export const START = PRESETS[0].deck;

export function total(deck: Deck) {
	return deck.reduce((sum, count) => sum + count, 0);
}

export function mass(deck: Deck) {
	return deck.reduce((sum, count) => sum + Math.abs(count), 0);
}

export function negative(deck: Deck) {
	return deck.some((count) => count < 0);
}

export function valid(deck: Deck) {
	return (
		deck.length === 8 &&
		deck.every((c) => Number.isInteger(c) && Math.abs(c) <= MOST) &&
		total(deck) > 0
	);
}

export function predict(deck: Deck, step: number) {
	const t = total(deck);

	if (t <= 0) return null;

	return (
		ORDER.reduce<number>(
			(sum, card) => sum + (deck[card] ?? 0) * agreement(card, step),
			0,
		) / t
	);
}

export function predictions(deck: Deck) {
	return [0, 1, 2, 3].map((step) => predict(deck, step));
}

export function negativeShare(deck: Deck) {
	const m = mass(deck);

	return m === 0 ? 0 : deck.reduce((sum, c) => sum + Math.max(0, -c), 0) / m;
}

export function cost(deck: Deck) {
	const t = total(deck);

	return t > 0 ? (mass(deck) / t) ** 2 : Number.POSITIVE_INFINITY;
}

export function draw(deck: Deck, random: Random) {
	let at = Math.floor(random() * mass(deck));

	for (let card = 0; card < 8; card++) {
		const weight = Math.abs(deck[card] ?? 0);

		if (at < weight) return { card, sign: Math.sign(deck[card] ?? 1) };

		at -= weight;
	}

	return { card: FIG_5A, sign: 1 };
}

export function adjust(deck: Deck, card: number, by: number): Deck {
	return deck.map((count, i) =>
		i === card ? Math.max(-MOST, Math.min(MOST, count + by)) : count,
	);
}
