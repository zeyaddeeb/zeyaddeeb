import { pitchClass } from "./pitch";

export interface Chord {
	root: number;
	tones: number[];
}

const qualities: Record<string, number[]> = {
	"": [0, 4, 7],
	7: [0, 4, 7, 10],
	m: [0, 3, 7],
};

const chordPattern = /^([A-G])(#|b)?(m|7)?$/;

export function chord(symbol: string): Chord | null {
	const match = symbol.match(chordPattern);

	if (!match) return null;

	const [, letter, accidental, quality = ""] = match;

	return { root: pitchClass(letter, accidental), tones: qualities[quality] };
}

export function degree(c: Chord, step: number): number {
	const [, third, fifth] = c.tones;
	const sixth = third === 4 ? 9 : 8;

	return [0, 2, third, 5, fifth, sixth, 10][step - 1];
}

export const lift = (pitch: number, base: number) =>
	base + ((((pitch - base) % 12) + 12) % 12);

export const voicing = (c: Chord, base: number) =>
	c.tones
		.slice(-3)
		.map((tone) => lift(c.root + tone, base))
		.sort((a, b) => a - b);
