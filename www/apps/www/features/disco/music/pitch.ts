const letters: Record<string, number> = {
	c: 0,
	d: 2,
	e: 4,
	f: 5,
	g: 7,
	a: 9,
	b: 11,
};

const notePattern = /^([a-g])(#|b)?(\d)$/;

export const hz = (key: number) => 440 * 2 ** ((key - 69) / 12);

export function pitchClass(letter: string, accidental = ""): number {
	const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;

	return (letters[letter.toLowerCase()] + shift + 12) % 12;
}

export function key(name: string): number | null {
	const match = name.match(notePattern);

	if (!match) return null;

	const [, letter, accidental, octave] = match;
	const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;

	return 12 * (Number(octave) + 1) + letters[letter] + shift;
}
