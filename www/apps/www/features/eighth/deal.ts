import { dot, fromBase, pin } from "./card";
import { type Deck, draw } from "./deck";
import { follow, pair, type Random, step } from "./nature";
import type { Answer, Deal, Trial } from "./protocol";

export const PAIRS = 2400;

const coin = (random: Random) => random() < 0.5;
const dial = (random: Random) => Math.floor(random() * 6);
const code = (black: boolean | null): Answer =>
	black === null ? 2 : black ? 1 : 0;

function dealt(
	k: number,
	dials: [number, number],
	answers: [boolean | null, boolean | null],
	sign = 1,
	card: number | null = null,
): Trial {
	return {
		k,
		dials,
		answers: [code(answers[0]), code(answers[1])],
		sign,
		card,
		west: { dial: null, commit: null, heard: null },
		east: { dial: null, commit: null },
	};
}

function one(deal: Deal, deck: Deck, random: Random, k: number): Trial {
	if (deal === "deck") {
		const { card, sign } = draw(deck, random);
		const w = dial(random);
		const e = dial(random);

		return dealt(k, [w, e], [dot(card, w), dot(card, e)], sign, card);
	}

	if (deal === "talk") {
		const card = fromBase([coin(random), coin(random), coin(random)]);
		const w = dial(random);
		const e = dial(random);
		const told = dot(card, e);

		return dealt(k, [w, e], [follow(random, step(e, w), told), told]);
	}

	if (deal === "dark") {
		const target = dial(random);
		const black = coin(random);
		const card = fromBase(
			[0, 1, 2].map((d) => follow(random, step(target, d), black)) as [
				boolean,
				boolean,
				boolean,
			],
		);
		const w = dial(random);
		const e = dial(random);
		const west = w === target ? black : w === (target + 3) % 6 ? !black : null;

		return dealt(k, [w, e], [west, dot(card, e)]);
	}

	const w = dial(random);
	const e = dial(random);
	const [a, b] = pair(random, w, e);
	const base: [boolean, boolean, boolean] = [
		coin(random),
		coin(random),
		coin(random),
	];

	pin(base, w, a);
	pin(base, e, b);

	const card = fromBase(base);

	return dealt(k, [w, e], [dot(card, w), dot(card, e)]);
}

export function shuffle(
	deal: Deal,
	deck: Deck,
	random: Random = Math.random,
	n = PAIRS,
) {
	return Array.from({ length: n }, (_, k) => one(deal, deck, random, k));
}
