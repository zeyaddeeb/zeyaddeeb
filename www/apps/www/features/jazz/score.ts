import {
	bass,
	type Chord,
	chord,
	chordPattern,
	pitch,
	swing,
	voicing,
} from "./music";
import {
	cycle,
	type Node,
	PatternError,
	parse,
	type Span,
	words,
} from "./pattern";

export const voices = [
	"cornet",
	"clarinet",
	"trombone",
	"piano",
	"banjo",
] as const;
export type Voice = (typeof voices)[number];
export type LaneId = "chords" | "you" | Voice;
export const laneIds: LaneId[] = ["chords", "you", ...voices];

export interface Score {
	tempo: number;
	swing: number;
	code: Record<LaneId, string>;
	muted: LaneId[];
}

export interface Problem {
	at: number;
	message: string;
}

export interface Compiled {
	node: Node | null;
	problem: Problem | null;
}

const hints: Record<LaneId, string> = {
	chords: "a chord like Bb7, Eb, F7 or Gm",
	you: "a note like bb4, or a slide like db5>d5",
	cornet: "a note like bb4, or a slide like db5>d5",
	clarinet: "a note like d6, or a slide like f5>ab5",
	trombone: "a note like bb2, or a slide like f2>bb2",
	piano: "x for a chord, or 1, 3 or 5 for a bass note",
	banjo: "x for a strum",
};

function valid(lane: LaneId, word: string) {
	if (lane === "chords") return chordPattern.test(word);

	if (lane === "piano") return /^(x|1|3|5)$/.test(word);

	if (lane === "banjo") return word === "x";

	return pitch(word) !== null;
}

export function compile(lane: LaneId, code: string): Compiled {
	if (!code.trim()) return { node: null, problem: null };

	try {
		const node = parse(code);
		const wrong = words(node).find((w) => !valid(lane, w.value));

		if (wrong)
			return {
				node: null,
				problem: {
					at: wrong.span[0],
					message: `“${wrong.value}” isn’t ${hints[lane]}.`,
				},
			};

		return { node, problem: null };
	} catch (error) {
		if (error instanceof PatternError)
			return { node: null, problem: { at: error.at, message: error.message } };

		throw error;
	}
}

export interface Note {
	lane: LaneId;
	begin: number;
	end: number;
	onset: number;
	offset: number;
	value: string;
	span: Span;
	keys: number[];
	slide: number | null;
	chord: Chord | null;
}

export type CompiledScore = Record<LaneId, Compiled>;

export function compileAll(score: Score): CompiledScore {
	return Object.fromEntries(
		laneIds.map((id) => [id, compile(id, score.code[id])]),
	) as CompiledScore;
}

const fallback = chord("Bb") as Chord;

function chordAt(compiled: CompiledScore, time: number): Chord {
	const node = compiled.chords.node;

	if (!node) return fallback;

	const bar = Math.floor(time);
	const hit = cycle(node, bar).find((h) => h.begin <= time && time < h.end);

	return (hit && chord(hit.value)) || fallback;
}

export function notes(
	compiled: CompiledScore,
	lane: LaneId,
	bar: number,
	ratio: number,
): Note[] {
	const node = compiled[lane].node;

	if (!node) return [];

	return cycle(node, bar).map((hap) => {
		const harmony = chordAt(compiled, hap.begin);
		let keys: number[] = [];
		let slide: number | null = null;
		let current: Chord | null = null;

		if (lane === "chords") current = chord(hap.value);
		else if (lane === "piano") {
			current = harmony;

			keys =
				hap.value === "x"
					? voicing(harmony, 57, 4)
					: [bass(harmony, hap.value, 36)];
		} else if (lane === "banjo") {
			current = harmony;
			keys = voicing(harmony, 55, 4);
		} else {
			const p = pitch(hap.value);

			if (p) {
				keys = [p.from];
				slide = p.to;
			}
		}

		return {
			lane,
			begin: hap.begin,
			end: hap.end,
			onset: swing(hap.begin, ratio),
			offset: swing(hap.end, ratio),
			value: hap.value,
			span: hap.span,
			keys,
			slide,
			chord: current,
		};
	});
}

export function replaceSpan(code: string, span: Span, text: string) {
	return code.slice(0, span[0]) + text + code.slice(span[1]);
}
