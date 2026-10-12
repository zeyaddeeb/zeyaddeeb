import { describe, expect, it } from "vitest";
import type { Note } from "./arrange";
import { barBeats } from "./notation";
import { lifetime } from "./patches";
import { charts, score } from "./score";
import { polyphony } from "./synth";
import { type Tune, tune, tunes } from "./tunes";
import { isDrum, voices } from "./voices";

const tempos = {
	charleston: 196,
	salsa: 184,
	twist: 160,
	fiesta: 103,
	polka: 124,
	korobeiniki: 138,
};

const inBar = (notes: Note[], bar: number) =>
	notes.filter((note) => Math.floor(note.beat / barBeats) === bar);

function busiest(t: Tune, rate: number): number {
	const perBeat = 60 / (t.bpm * rate);
	const edges = [0, t.beats].flatMap((turn) =>
		score(t.id).flatMap((note) => {
			const from = (turn + note.beat) * perBeat;
			const to = from + lifetime(note.voice, note.length * perBeat);

			return [
				{ at: from, step: 1 },
				{ at: to, step: -1 },
			];
		}),
	);
	let sounding = 0;
	let most = 0;

	for (const edge of edges.sort((a, b) => a.at - b.at || a.step - b.step)) {
		sounding += edge.step;
		most = Math.max(most, sounding);
	}

	return most;
}

describe("tunes", () => {
	it("lists the six files with their tempos", () => {
		expect(tunes.map((t) => [t.id, t.bpm])).toEqual(Object.entries(tempos));

		for (const t of tunes) {
			expect(t.file).toBe(`${t.id}.mid`);
			expect(t.title.length).toBeGreaterThan(0);
			expect(tune(t.id)).toBe(t);
		}
	});

	it("loops on a whole number of bars that matches the chart", () => {
		for (const t of tunes) {
			const bars = charts[t.id].chords.length;

			expect(t.beats, t.id).toBe(bars * barBeats);
			expect(bars, t.id).toBeGreaterThanOrEqual(16);
			expect(bars, t.id).toBeLessThanOrEqual(32);

			for (const part of charts[t.id].parts)
				expect(bars % part.bars.length, `${t.id} ${part.voice}`).toBe(0);
		}
	});
});

describe.each(tunes)("$file", (t) => {
	const notes = score(t.id);

	it("plays known instruments at sensible pitches", () => {
		for (const note of notes) {
			const where = `${note.voice} at beat ${note.beat}`;

			expect(voices, where).toContain(note.voice);
			expect(note.beat, where).toBeGreaterThanOrEqual(0);
			expect(note.beat, where).toBeLessThan(t.beats);
			expect(note.length, where).toBeGreaterThan(0);
			expect(note.velocity, where).toBeGreaterThan(0);
			expect(note.velocity, where).toBeLessThanOrEqual(1.25);

			if (isDrum(note.voice)) continue;

			expect(note.key, where).toBeGreaterThanOrEqual(28);
			expect(note.key, where).toBeLessThanOrEqual(96);
		}
	});

	it("has no silent bar", () => {
		for (let bar = 0; bar < t.beats / barBeats; bar++) {
			const heard = inBar(notes, bar);

			expect(
				heard.some((note) => !isDrum(note.voice)),
				`bar ${bar + 1} melody`,
			).toBe(true);
			expect(
				heard.some((note) => isDrum(note.voice)),
				`bar ${bar + 1} drums`,
			).toBe(true);
		}
	});

	it("marks every beat with a drum for the dancers", () => {
		const marked = new Set(
			notes.filter((note) => isDrum(note.voice)).map((note) => note.beat),
		);

		for (let beat = 0; beat < t.beats; beat++)
			expect(marked.has(beat), `beat ${beat}`).toBe(true);
	});

	it("sounds a bass note on every downbeat or ties one over it", () => {
		const low = notes.filter((n) => n.voice === "bass" || n.voice === "tuba");

		for (let bar = 1; bar < t.beats / barBeats; bar++) {
			const beat = bar * barBeats;

			expect(
				low.some((n) => n.beat <= beat && n.beat + n.length > beat),
				`bar ${bar + 1}`,
			).toBe(true);
		}
	});

	it("stays within the voice budget at every speed", () => {
		for (const rate of [0.5, 1, 1.5])
			expect(busiest(t, rate), `rate ${rate}`).toBeLessThanOrEqual(polyphony);
	});

	it("is arranged once and reused", () => {
		expect(score(t.id)).toBe(notes);
	});
});
