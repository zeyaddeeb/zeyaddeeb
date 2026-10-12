import { FILMED_AT, filmed, films, said } from "./film";
import type { Reading } from "./floor";

type Mood = "alone" | "finding" | "limit" | "every";

const HOW: Record<Mood, string> = {
	alone: "dealing freely",
	finding: "finding the beat",
	limit: "out of reach",
	every: "on the beat",
};

export function mood(reading: Reading, playing: boolean): Mood {
	if (!playing) return "alone";

	if (reading.strained) return "limit";

	return reading.locked ? "every" : "finding";
}

export const HOWS = Object.values(HOW);

export const how = (reading: Reading, playing: boolean) =>
	HOW[mood(reading, playing)];

function line(who: string, feeling: Mood) {
	const lines: Record<Mood, string> = {
		alone: `No music. ${who}: one move after another, as filmed.`,
		finding: `${who}: lining the next move up with the beat.`,
		limit: `Out of reach for ${who}: the film only runs 26 to 34 frames a second.`,
		every: `${who}: every move starts on a beat.`,
	};

	return lines[feeling];
}

export const HELD =
	"This device asks for less motion, so the dancers hold a pose.";

export const TROUBLE = "The tune could not start. Press play to try again.";

export const caption = (reading: Reading, playing: boolean) =>
	line(said(reading.id), mood(reading, playing));

export const CAPTIONS = [
	HELD,
	TROUBLE,
	...films.flatMap((id) =>
		(Object.keys(HOW) as Mood[]).map((feeling) => line(said(id), feeling)),
	),
];

export const drift = (reading: Reading) =>
	`move ${reading.move + 1}/${filmed(reading.id).moves.length} · ${(reading.speed * FILMED_AT).toFixed(1)} fps`;
