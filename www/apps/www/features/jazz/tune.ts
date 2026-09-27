import { noteName } from "./music";
import { compileAll, type LaneId, notes, type Score } from "./score";

export const chorus = 12;

type Bars = string[];

const all = (bar: string): Bars => Array(chorus).fill(bar);

const changes: Bars = [
	"Bb7",
	"Eb7",
	"Bb7",
	"Bb7",
	"Eb7",
	"Eb7",
	"Bb7",
	"Bb7",
	"F7",
	"Eb7",
	"Bb7",
	"F7",
];

const head: Bars = [
	"[d5 f5 ~ d5]",
	"[f5@2 ~ ~]",
	"[d5 bb4 ~ g4]",
	"[bb4@2 ~ ~]",
	"[db5 f5 ~ db5]",
	"[f5@2 ~ ~]",
	"[d5 bb4 ~ g4]",
	"[bb4@2 ~ ~]",
	"[c5 eb5 ~ c5]",
	"[f5@2 eb5 c5]",
	"[d5 bb4 ~ g4]",
	"[a4 c5 eb5 ~]",
];

const bends = [0, 2, 6, 10];

const obbligato: Bars = [
	"[f5@2 d5@2]",
	"[g5@2 eb5@2]",
	"[ab5 f5 d5 f5]",
	"[bb5@2 ~ ~]",
	"[g5@2 eb5@2]",
	"[bb5@2 g5 eb5]",
	"[ab5 f5 d5 f5]",
	"[bb5@2 ~ ~]",
	"[a5@2 f5@2]",
	"[g5@2 eb5@2]",
	"[f5 d5 bb4 d5]",
	"[c5 eb5 f5 a5]",
];

const tailgate: Bars = [
	"[bb2@3 f2]",
	"[eb2@3 g2]",
	"[bb2@2 d3 bb2]",
	"[ab2@2 f2>ab2@2]",
	"[eb2@3 g2]",
	"[eb2 g2 bb2 db3]",
	"[bb2@3 f2]",
	"[d3 bb2 f2>bb2@2]",
	"[f2@3 a2]",
	"[eb2@2 g2 bb2]",
	"[bb2 d3 f2 ab2]",
	"[c3 a2 f2>c3@2]",
];

const solo: Bars = [
	"[f5 g5 f5 d5 bb5 a5 bb5 f5]",
	"[g5 eb5 bb4 eb5 g5@2 f5 eb5]",
	"[d5 f5 ab5 f5 d5 bb4 d5 f5]",
	"[bb5@3 ~]",
	"[db6 bb5 g5 eb5 db5@2 eb5 g5]",
	"[bb5 g5 eb5 db5 bb4@2 ~ ~]",
	"[d5 f5 bb5 d6 bb5 f5 d5 bb4]",
	"[f5@2 ~ d5 f5 ab5 bb5 ~]",
	"[c6 a5 f5 eb5 c5 eb5 f5 a5]",
	"[bb5 g5 eb5 bb4 g5@2 f5 eb5]",
	"[d5 f5 bb5 f5 d5 bb4 d5 f5]",
	"[a5 c6 eb6 c6 a5@2 ~ ~]",
];

const answers: Record<number, string> = {
	2: "[~ bb5 [ab5 f5] d5]",
	3: "[db5>d5@2 bb4 ~]",
	6: "[~ bb5 [ab5 f5] d5]",
	7: "[f5@2 ~ ~]",
	10: "[~ f5 [d5 bb4] g4]",
	11: "[a4 c5 eb5 f5]",
};

const breakRun = [
	"[bb4 [~ d5] [f5 d5] [db5 c5]]",
	"[[bb4 g4] [f4 g4] [bb4 db5>d5] [bb4 c5]]",
];

const breakRunHigh = [
	"[bb5 [~ d6] [f6 d6] [db6 c6]]",
	"[[bb5 g5] [f5 g5] [bb5 db6>d6] [bb5 c6]]",
];

export type Tempo = "medium" | "drag" | "stomp";
export type Lineup = "lead" | "everybody" | "clarinet" | "answer";
export type Rhythm = "four" | "two" | "stop";

export interface Calls {
	swing: boolean;
	tempo: Tempo;
	lineup: Lineup;
	rhythm: Rhythm;
	blue: boolean;
	break: boolean;
}

export const opening: Calls = {
	swing: false,
	tempo: "medium",
	lineup: "lead",
	rhythm: "four",
	blue: false,
	break: false,
};

export type CallId =
	| "swing"
	| "drag"
	| "stomp"
	| "everybody"
	| "clarinet"
	| "answer"
	| "two"
	| "stop"
	| "blue"
	| "break";

export interface Call {
	id: CallId;
	shout: string;
	row: "feel" | "band" | "rhythm";
}

export const calls: Call[] = [
	{ id: "swing", shout: "Swing it!", row: "feel" },
	{ id: "drag", shout: "Slow drag", row: "feel" },
	{ id: "stomp", shout: "Stomp it!", row: "feel" },
	{ id: "everybody", shout: "Everybody in!", row: "band" },
	{ id: "clarinet", shout: "Clarinet, take it!", row: "band" },
	{ id: "answer", shout: "Answer me", row: "band" },
	{ id: "two", shout: "Two-beat", row: "rhythm" },
	{ id: "stop", shout: "Stop time!", row: "rhythm" },
	{ id: "blue", shout: "Bend it blue", row: "rhythm" },
	{ id: "break", shout: "Oh, play that thing!", row: "rhythm" },
];

export function isOn(c: Calls, id: CallId): boolean {
	switch (id) {
		case "swing":
			return c.swing;
		case "drag":
		case "stomp":
			return c.tempo === id;
		case "everybody":
		case "clarinet":
		case "answer":
			return c.lineup === id;
		case "two":
		case "stop":
			return c.rhythm === id;
		case "blue":
			return c.blue;
		case "break":
			return c.break;
	}
}

export function call(c: Calls, id: CallId): Calls {
	const on = !isOn(c, id);
	switch (id) {
		case "swing":
			return { ...c, swing: on };
		case "drag":
		case "stomp":
			return { ...c, tempo: on ? id : "medium" };
		case "everybody":
		case "clarinet":
		case "answer":
			return { ...c, lineup: on ? id : "lead" };
		case "two":
		case "stop":
			return { ...c, rhythm: on ? id : "four" };
		case "blue":
			return { ...c, blue: on };
		case "break":
			return { ...c, break: on };
	}
}

const tempos: Record<Tempo, number> = { medium: 120, drag: 76, stomp: 184 };
const swings: Record<Tempo, number> = { medium: 2, drag: 3, stomp: 1.5 };

function wrap(bar: string) {
	return /\s/.test(bar) && !(bar.startsWith("[") && bar.endsWith("]"))
		? `[${bar}]`
		: bar;
}

export function serialize(bars: Bars): string {
	if (bars.every((b) => b === bars[0])) return bars[0];
	const items: string[] = [];
	for (let i = 0; i < bars.length; ) {
		let j = i;
		while (j + 1 < bars.length && bars[j + 1] === bars[i]) j++;
		const n = j - i + 1;
		items.push(`${wrap(bars[i])}${n > 1 ? `!${n}` : ""}`);
		i = j + 1;
	}
	return `<${items.join(" ")}>`;
}

export function arrange(c: Calls): Score {
	let cornet = head.map((bar, i) =>
		c.blue && bends.includes(i) ? bar.replace("d5", "db5>d5") : bar,
	);
	let clarinet = all("~");
	let trombone = all("~");
	if (c.lineup === "everybody") {
		clarinet = [...obbligato];
		trombone = [...tailgate];
	} else if (c.lineup === "clarinet") {
		clarinet = [...solo];
		cornet = all("~");
	} else if (c.lineup === "answer") {
		clarinet = cornet.map((_, i) => answers[i] ?? "~");
		cornet = cornet.map((bar, i) => (i in answers ? "~" : bar));
	}
	const pattern = {
		four: ["x x x x", "1 x 5 x"],
		two: ["x ~ x ~", "1 ~ 5 ~"],
		stop: ["x ~ ~ ~", "x ~ ~ ~"],
	}[c.rhythm];
	const banjo = all(pattern[0]);
	const piano = all(pattern[1]);
	if (c.break) {
		const soloist = c.lineup === "clarinet" ? "clarinet" : "cornet";
		for (const lane of [banjo, piano]) {
			lane[10] = "x ~ ~ ~";
			lane[11] = "~";
		}
		trombone[10] = trombone[10] === "~" ? "~" : "[bb2 ~ ~ ~]";
		trombone[11] = "~";
		if (soloist === "cornet") {
			clarinet[10] = clarinet[10] === "~" ? "~" : "[d5 ~ ~ ~]";
			clarinet[11] = "~";
			[cornet[10], cornet[11]] = breakRun;
		} else {
			[clarinet[10], clarinet[11]] = breakRunHigh;
		}
	}
	return {
		tempo: tempos[c.tempo],
		swing: c.swing ? swings[c.tempo] : 1,
		code: {
			chords: serialize(changes),
			cornet: serialize(cornet),
			clarinet: serialize(clarinet),
			trombone: serialize(trombone),
			piano: serialize(piano),
			banjo: serialize(banjo),
		},
		muted: [],
	};
}

export type RecordId = "bessie" | "oliver";

export interface Recording {
	id: RecordId;
	src: string;
	title: string;
	year: number;
	credit: string;
	page: string;
}

export const records: Recording[] = [
	{
		id: "bessie",
		src: "https://upload.wikimedia.org/wikipedia/commons/b/b2/Bessie_Smith_and_Louis_Armstrong_-_The_St._Louis_Blues_%281925%29.mp3",
		title: "The St. Louis Blues",
		year: 1925,
		credit:
			"Bessie Smith, vocals; Louis Armstrong, cornet; Fred Longshaw, harmonium. Columbia.",
		page: "https://commons.wikimedia.org/wiki/File:Bessie_Smith_and_Louis_Armstrong_-_The_St._Louis_Blues_(1925).mp3",
	},
	{
		id: "oliver",
		src: "https://upload.wikimedia.org/wikipedia/commons/e/e6/Dippermouth_Blues_-_KING_OLIVER%27S_JAZZ_BAND.flac",
		title: "Dipper Mouth Blues",
		year: 1923,
		credit:
			"King Oliver’s Jazz Band: King Oliver and Louis Armstrong, cornets; Johnny Dodds, clarinet; Honoré Dutrey, trombone. Okeh.",
		page: "https://commons.wikimedia.org/wiki/File:Dippermouth_Blues_-_KING_OLIVER%27S_JAZZ_BAND.flac",
	},
];

export interface Caption {
	shout: string | null;
	text: string;
	record: RecordId | null;
}

export const welcome: Caption = {
	shout: "One, two, one two three four!",
	text: "Press the red disc to count the band in. Then call out changes: each call lands on the next bar and rewrites the code.",
	record: null,
};

function middle(score: Score, lane: LaneId) {
	const compiled = compileAll(score);
	const keys: number[] = [];
	for (let bar = 0; bar < chorus; bar++)
		for (const n of notes(compiled, lane, bar, 1)) keys.push(...n.keys);
	keys.sort((a, b) => a - b);
	return noteName(keys[Math.floor(keys.length / 2)] ?? 60);
}

export function caption(c: Calls, id: CallId): Caption {
	const on = isOn(c, id);
	const shout = calls.find((x) => x.id === id)?.shout ?? null;
	const say = (text: string, record: RecordId | null = null): Caption => ({
		shout: on ? shout : null,
		text,
		record,
	});
	const score = arrange(c);
	switch (id) {
		case "swing": {
			if (!on)
				return say(
					"Straight again: every eighth note the same length, like a march.",
				);
			const late = Math.round((score.swing / (1 + score.swing)) * 100);
			return say(
				`The second eighth of every beat now waits until ${late}% of the beat has gone. Same notes, same tempo. That wait is swing.`,
			);
		}
		case "drag":
		case "stomp": {
			if (!on) return say("Back to 120 beats a minute, a medium bounce.");
			if (id === "drag")
				return say(
					c.swing
						? "Tempo 76. Slow bands swing harder: the long eighth stretches to three times the short one."
						: "Tempo 76, a slow drag. Swing it and hear how far a slow band stretches the long eighth.",
				);
			return say(
				c.swing
					? "Tempo 184. Fast bands swing lighter: at this speed the eighths even out to 3:2."
					: "Tempo 184, a stomp. Swing it and listen: this fast, the eighths barely swing.",
			);
		}
		case "everybody":
			if (!on) return say("The cornet leads alone again.");
			return say(
				`Three horns at once, each in its own lane: cornet in the middle around ${middle(score, "cornet")}, clarinet above around ${middle(score, "clarinet")}, trombone below around ${middle(score, "trombone")}.`,
				"oliver",
			);
		case "clarinet":
			if (!on) return say("The cornet leads again.");
			return say(
				"The cornet sits out and the clarinet takes the chorus. Solos in turn caught on with Armstrong’s Hot Five records.",
			);
		case "answer":
			if (!on) return say("The cornet plays the whole tune again.");
			return say(
				"The cornet calls for two bars and the clarinet answers in the gap. In 1925 Bessie Smith sang the calls and Armstrong answered.",
				"bessie",
			);
		case "two":
			if (!on) return say("Four to the bar: the banjo strums every beat.");
			return say(
				"The banjo strums on 1 and 3 only, the older two-beat. Four to the bar sounds smoother; two-beat bounces.",
			);
		case "stop":
			if (!on) return say("The rhythm section plays through the bar again.");
			return say(
				"Stop time: the band hits once a bar and leaves the rest empty, so the horn has the room to itself.",
			);
		case "blue":
			if (!on)
				return say(
					"Plain thirds again: d, not a bend. Sweeter, and less like the blues.",
				);
			return say(
				`The cornet bends ${bends.length} of its thirds up from db to d. The blues lives between those two notes; a piano can’t bend, so pianists play both.`,
			);
		case "break":
			if (!on) return say("No break: the band plays straight through bar 12.");
			return say(
				`Bars 11 and 12: the band stops and the ${c.lineup === "clarinet" ? "clarinet" : "cornet"} plays alone. That’s a break. On a 1923 record someone shouts this line during one.`,
				"oliver",
			);
	}
}
