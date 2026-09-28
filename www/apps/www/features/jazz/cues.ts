import type { Player } from "./model";
import type { Caption } from "./tune";

const first: Record<Player["id"], string> = {
	armstrong: "Louis",
	dodds: "Johnny",
	ory: "Kid",
};

const yourTurns = [
	"Tap the keys to answer him, or use A to ; on a keyboard. Every key fits the tune, so there are no wrong notes.",
	"Try echoing a bit of what he just played. If your notes match his records, he picks up where the record goes.",
	"Try leaving space. Two or three notes are plenty, and he answers whatever you give him.",
	"Try Hum. With headphones on, it hears your voice and writes it down as notes.",
];

const hisTurns = [
	"He heard your last notes, marked in red, and looked for them in his solos. The outer ring names each record he borrows from.",
	"Set Memory to Quote and he plays longer phrases straight off the records.",
	"Set Memory to Stitch and he joins single notes into lines nobody played in that order.",
	"Trade with someone else below. Each player only knows his own solos.",
];

export function introCue(p: Player): Caption {
	return {
		shout: "One, two, one two three four!",
		text: `Press the red disc. ${p.short} plays four bars first, then it’s your turn to answer him on the keys.`,
		record: null,
	};
}

export function waitCue(p: Player, bar: number): Caption {
	return {
		shout: "Trade fours!",
		text: `${p.short} takes the next four, starting at bar ${bar}. Then it’s your turn to answer him on the keys.`,
		record: null,
	};
}

export function turnCue(p: Player, n: number): Caption {
	if (n === 0)
		return {
			shout: `Take it, ${first[p.id]}!`,
			text: `Listen first. Every note ${p.short} plays comes from one of his records. The outer ring of the clock names which one.`,
			record: null,
		};
	if (n % 2 === 1)
		return {
			shout: "Your four!",
			text: yourTurns[((n - 1) / 2) % yourTurns.length],
			record: null,
		};
	return {
		shout: `Answer, ${first[p.id]}!`,
		text: hisTurns[(n / 2 - 1) % hisTurns.length],
		record: null,
	};
}
