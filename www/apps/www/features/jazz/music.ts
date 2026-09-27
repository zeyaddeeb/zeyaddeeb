const letters: Record<string, number> = {
	c: 0,
	d: 2,
	e: 4,
	f: 5,
	g: 7,
	a: 9,
	b: 11,
};

const flats = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];

const notePattern = /^([a-g])(#|b)?(\d)$/;

export function midi(name: string): number | null {
	const match = name.toLowerCase().match(notePattern);
	if (!match) return null;
	const [, letter, accidental, octave] = match;
	const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
	return 12 * (Number(octave) + 1) + letters[letter] + shift;
}

export function noteName(key: number): string {
	return `${flats[((key % 12) + 12) % 12]}${Math.floor(key / 12) - 1}`;
}

export interface Pitch {
	from: number;
	to: number | null;
}

export function pitch(word: string): Pitch | null {
	const [a, b, extra] = word.split(">");
	if (extra !== undefined) return null;
	const from = midi(a);
	if (from === null) return null;
	if (b === undefined) return { from, to: null };
	const to = midi(b);
	return to === null ? null : { from, to };
}

const qualities: Record<string, number[]> = {
	"": [0, 4, 7],
	6: [0, 4, 7, 9],
	7: [0, 4, 7, 10],
	9: [0, 4, 10, 14],
	maj7: [0, 4, 7, 11],
	m: [0, 3, 7],
	m6: [0, 3, 7, 9],
	m7: [0, 3, 7, 10],
	dim: [0, 3, 6, 9],
	aug: [0, 4, 8],
};

export const chordPattern = /^([A-G])(#|b)?(maj7|m6|m7|dim|aug|m|6|7|9)?$/;

export interface Chord {
	root: number;
	tones: number[];
	name: string;
}

export function chord(symbol: string): Chord | null {
	const match = symbol.match(chordPattern);
	if (!match) return null;
	const [, letter, accidental, quality = ""] = match;
	const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
	const root = (letters[letter.toLowerCase()] + shift + 12) % 12;
	return { root, tones: qualities[quality], name: symbol };
}

export function voicing(c: Chord, low: number, count = 4): number[] {
	const classes = c.tones.map((t) => (c.root + t) % 12);
	const out: number[] = [];
	for (let key = low; out.length < count && key < low + 24; key++)
		if (classes.includes(key % 12)) out.push(key);
	return out;
}

export function bass(c: Chord, degree: string, low = 34): number {
	const offset =
		degree === "5"
			? c.tones.find((t) => t % 12 === 7 || t % 12 === 6 || t % 12 === 8)
			: degree === "3"
				? c.tones.find((t) => t === 3 || t === 4)
				: 0;
	const cls = (c.root + (offset ?? 0)) % 12;
	let key = low;
	while (key % 12 !== cls) key++;
	return key;
}

export function swing(t: number, ratio: number): number {
	if (ratio === 1) return t;
	const beats = t * 4;
	const beat = Math.floor(beats + 1e-9);
	const f = beats - beat;
	const late = ratio / (1 + ratio);
	const g = f <= 0.5 ? f * 2 * late : late + (f - 0.5) * 2 * (1 - late);
	return (beat + g) / 4;
}

export function ratioLabel(ratio: number) {
	if (ratio === 1) return "1:1";
	if (Number.isInteger(ratio)) return `${ratio}:1`;
	const twice = ratio * 2;
	if (Number.isInteger(twice)) return `${twice}:2`;
	return `${ratio.toFixed(2)}:1`;
}

export function shiftChord(symbol: string, by: number): string | null {
	const match = symbol.match(chordPattern);
	if (!match) return null;
	const c = chord(symbol);
	if (!c) return null;
	const root = flats[(((c.root + by) % 12) + 12) % 12];
	return root[0].toUpperCase() + root.slice(1) + (match[3] ?? "");
}

export function shiftNote(word: string, by: number): string | null {
	const p = pitch(word);
	if (!p) return null;
	const from = noteName(p.from + by);
	return p.to === null ? from : `${from}>${noteName(p.to + by)}`;
}
