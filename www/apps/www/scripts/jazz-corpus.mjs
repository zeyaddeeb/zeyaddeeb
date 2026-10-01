import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SOURCE = "https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db";
const OUTPUT = new URL("../features/jazz/corpus-data.ts", import.meta.url);
const PLAYERS = {
	"Louis Armstrong": "armstrong",
	"Johnny Dodds": "dodds",
	"Kid Ory": "ory",
};
const TARGET = 10;
const RANGES = { armstrong: [55, 86], dodds: [52, 94], ory: [40, 74] };
const TITLES = {
	"Hotter than That": "Hotter Than That",
	"Who's it": "Who’s It",
};
const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

async function database() {
	const path = process.argv[2] ?? join(tmpdir(), "wjazzd.db");

	if (!existsSync(path)) {
		const response = await fetch(SOURCE);

		if (!response.ok) throw new Error(`${SOURCE}: ${response.status}`);

		writeFileSync(path, Buffer.from(await response.arrayBuffer()));
	}

	return new DatabaseSync(path, { readOnly: true });
}

function root(name) {
	const match = name?.match(/^([A-G])(b|#)?/);

	if (!match) return null;

	return (
		(LETTERS[match[1]] + (match[2] === "b" ? -1 : match[2] ? 1 : 0) + 12) % 12
	);
}

function role(chord, tonic) {
	const r = root(chord);

	if (r === null) return 3;

	const rel = (r - tonic + 12) % 12;

	return rel === 0 ? 0 : rel === 5 ? 1 : rel === 7 ? 2 : 3;
}

const db = await database();
const solos = db
	.prepare(
		`select s.melid, s.performer, s.title, s.key, s.signature, t.recordingdate, x.solostart_sec
		 from solo_info s
		 join track_info t using(trackid)
		 join transcription_info x on x.melid = s.melid
		 where s.performer in (${Object.keys(PLAYERS)
				.map(() => "?")
				.join(",")}) and s.style = 'TRADITIONAL'
		 order by s.performer, t.recordingdate, s.title`,
	)
	.all(...Object.keys(PLAYERS));

const out = [];
for (const solo of solos) {
	if (solo.signature !== "4/4") continue;

	const tonic = root(solo.key);
	const [lo, hi] = RANGES[PLAYERS[solo.performer]];

	const pitches = db
		.prepare("select pitch from melody where melid = ?")
		.all(solo.melid)
		.map((row) => Math.round(row.pitch));

	const base = (TARGET - tonic + 12) % 12;
	const outside = (shift) =>
		pitches.filter((p) => p + shift < lo || p + shift > hi).length;

	const shift = [base - 12, base].reduce((a, b) =>
		outside(b) < outside(a) ||
		(outside(b) === outside(a) && Math.abs(b) < Math.abs(a))
			? b
			: a,
	);

	const beats = db
		.prepare(
			"select bar, beat, onset, chord from beats where melid = ? order by onset",
		)
		.all(solo.melid);

	const at = new Map();
	let chord = null;

	for (const beat of beats) {
		if (beat.chord) chord = beat.chord === "NC" ? null : beat.chord;

		at.set(`${beat.bar}:${beat.beat}`, { onset: beat.onset, chord });
	}

	const melody = db
		.prepare(
			"select onset, pitch, duration, bar, beat, beatdur from melody where melid = ? order by onset",
		)
		.all(solo.melid);

	const notes = [];
	let last = -1;

	for (const note of melody) {
		const beat = at.get(`${note.bar}:${note.beat}`);

		if (!beat) continue;

		const frac = (note.onset - beat.onset) / note.beatdur;
		const third = Math.max(0, Math.min(3, Math.round(frac * 3)));
		const slot = ((note.bar + 1) * 4 + note.beat - 1) * 3 + third;

		if (slot <= last) continue;

		last = slot;

		notes.push(
			Math.round(note.pitch) + shift,
			slot,
			Math.max(1, Math.min(12, Math.round((note.duration / note.beatdur) * 3))),
			role(beat.chord, tonic),
			Math.round(solo.solostart_sec + note.onset),
		);
	}

	out.push({
		player: PLAYERS[solo.performer],
		title: TITLES[solo.title] ?? solo.title,
		date: solo.recordingdate,
		notes,
	});
}

writeFileSync(
	OUTPUT,
	`export interface CorpusSolo {\n\tplayer: "armstrong" | "dodds" | "ory";\n\ttitle: string;\n\tdate: string;\n\tnotes: number[];\n}\n\nexport const corpusData: CorpusSolo[] = ${JSON.stringify(out)};\n`,
);
console.log(
	out.map((s) => `${s.player} ${s.title} ${s.notes.length / 5}`).join("\n"),
);
