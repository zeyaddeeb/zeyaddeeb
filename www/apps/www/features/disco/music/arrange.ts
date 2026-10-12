import { type Chord, chord, degree, lift, voicing } from "./harmony";
import { type Bars, barBeats, type Step, steps } from "./notation";
import { key } from "./pitch";
import { isDrum, type Voice } from "./voices";

export interface Note {
	beat: number;
	length: number;
	voice: Voice;
	key: number;
	velocity: number;
}

export interface Part {
	voice: Voice;
	bars: Bars;
	level: number;
	base?: number;
	lead?: number;
	gate?: number;
	tremolo?: number;
}

export interface Chart {
	level: number;
	swing: number;
	chords: Bars;
	parts: Part[];
}

interface Change {
	begin: number;
	chord: Chord;
}

const strokes: Record<string, number> = { X: 1, x: 0.75, o: 0.4 };
const degreePattern = /^([1-7])([',]*)$/;

export function swing(beat: number, ratio: number): number {
	const whole = Math.floor(beat);
	const part = beat - whole;

	return part < 0.5
		? whole + part * 2 * ratio
		: whole + ratio + (part - 0.5) * 2 * (1 - ratio);
}

function changes(bars: Bars): Change[] {
	return steps(bars).map((step) => {
		const found = chord(step.token);

		if (!found) throw new Error(`unknown chord ${step.token}`);

		return { begin: step.begin, chord: found };
	});
}

function chordAt(harmony: Change[], beat: number): Chord {
	const heard = harmony.filter((change) => change.begin <= beat).at(-1);

	return (heard ?? harmony[0]).chord;
}

function pitches(atom: string, harmony: Chord, base: number): number[] {
	if (atom === "x") return voicing(harmony, base);

	const named = key(atom);

	if (named !== null) return [named];

	const match = atom.match(degreePattern);

	if (!match) throw new Error(`unknown note ${atom}`);

	const shift = [...match[2]].reduce(
		(sum, m) => sum + (m === "'" ? 12 : -12),
		0,
	);

	return [lift(harmony.root, base) + degree(harmony, Number(match[1])) + shift];
}

function strikes(step: Step, tremolo: number | undefined): Step[] {
	if (!tremolo || step.length < 1) return [step];

	return Array.from({ length: Math.round(step.length / tremolo) }, (_, i) => ({
		...step,
		begin: step.begin + i * tremolo,
		length: tremolo,
	}));
}

function sound(part: Part, step: Step, harmony: Chord, ratio: number): Note[] {
	const beat = swing(step.begin, ratio);
	const length =
		(swing(step.begin + step.length, ratio) - beat) * (part.gate ?? 0.9);
	const note = { beat, length, voice: part.voice };

	if (isDrum(part.voice)) {
		const stroke = strokes[step.token];

		if (!stroke) throw new Error(`unknown stroke ${step.token}`);

		return [{ ...note, key: 0, velocity: part.level * stroke }];
	}

	const accent = step.token.endsWith("!");
	const velocity = part.level * (accent ? 1 : 0.8);

	return (accent ? step.token.slice(0, -1) : step.token)
		.split("+")
		.flatMap((atom) => pitches(atom, harmony, part.base ?? 48))
		.map((pitch) => ({ ...note, key: pitch, velocity }));
}

function perform(
	part: Part,
	harmony: Change[],
	total: number,
	ratio: number,
): Note[] {
	const span = part.bars.length * barBeats;

	if (total % span !== 0)
		throw new Error(`${part.voice} repeats every ${span} of ${total} beats`);

	const pattern = steps(part.bars).flatMap((s) => strikes(s, part.tremolo));
	const out: Note[] = [];

	for (let offset = 0; offset < total; offset += span)
		for (const step of pattern) {
			const begin = step.begin + offset;
			const heard = chordAt(harmony, (begin + (part.lead ?? 0)) % total);

			out.push(...sound(part, { ...step, begin }, heard, ratio));
		}

	return out;
}

export function arrange(chart: Chart): Note[] {
	const harmony = changes(chart.chords);
	const total = chart.chords.length * barBeats;

	return chart.parts
		.flatMap((part) => perform(part, harmony, total, chart.swing))
		.map((note) => ({ ...note, velocity: note.velocity * chart.level }))
		.sort((a, b) => a.beat - b.beat);
}
