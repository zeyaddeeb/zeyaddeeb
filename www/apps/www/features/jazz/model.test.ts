import { describe, expect, it } from "vitest";
import { introCue, turnCue, waitCue } from "./cues";
import { snap, yin } from "./ear";
import { ask, fragments, lines, players, slotsPerBar, stats } from "./model";
import { parse } from "./pattern";
import { compile, compileAll, notes } from "./score";
import { bar, bars, slotAt, transcribe, yourLine } from "./trade";
import { barsOf, formatBar, itemsOf, roles, serialize } from "./tune";

function seeded(seed: number) {
	let a = seed;

	return () => {
		a = (a + 0x6d2b79f5) | 0;

		let t = Math.imul(a ^ (a >>> 15), 1 | a);

		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const phrase = [72, 73, 74, 77, 74, 72, 70, 67];

describe("corpus", () => {
	it("holds every Hot Five horn player", () => {
		expect(stats("armstrong").solos).toBe(8);
		expect(stats("dodds").solos).toBe(6);
		expect(stats("ory").solos).toBe(5);

		for (const line of lines)
			for (let i = 1; i < line.tones.length; i++)
				expect(line.tones[i].slot).toBeGreaterThan(line.tones[i - 1].slot);
	});
});

describe("ask", () => {
	it("fills four bars in range, and every note comes from a record", () => {
		for (const p of players)
			for (let memory = 1; memory <= 6; memory++) {
				const answer = ask({
					player: p.id,
					memory,
					history: phrase,
					roles: roles.slice(4, 8),
					yours: [],
					random: seeded(memory),
				});

				expect(answer.notes.length).toBeGreaterThan(4);

				for (const n of answer.notes) {
					expect(n.at).toBeGreaterThanOrEqual(0);
					expect(n.at + n.length).toBeLessThanOrEqual(4 * slotsPerBar);
					expect(n.key).toBeGreaterThanOrEqual(p.range[0]);
					expect(n.key).toBeLessThanOrEqual(p.range[1]);
					expect(n.line.who).toBe(p.id);
					expect(n.line.tones[n.index]).toBeDefined();
				}
			}
	});

	it("quotes longer phrases with more memory", () => {
		const pieces = (memory: number) => {
			let total = 0;

			for (let r = 0; r < 40; r++)
				total += fragments(
					ask({
						player: "armstrong",
						memory,
						history: phrase,
						roles: roles.slice(0, 4),
						yours: [],
						random: seeded(r),
					}).notes,
				).length;

			return total;
		};

		expect(pieces(5)).toBeLessThan(pieces(1) / 2);
	});

	it("keeps the intervals of a quote", () => {
		const answer = ask({
			player: "armstrong",
			memory: 6,
			history: phrase,
			roles: roles.slice(0, 4),
			yours: [],
			random: seeded(3),
		});

		for (let k = 1; k < answer.notes.length; k++) {
			const a = answer.notes[k - 1];
			const b = answer.notes[k];

			if (a.line !== b.line || a.index !== b.index - 1) continue;

			const source = b.line.tones[b.index].key - a.line.tones[a.index].key;

			expect((b.key - a.key - source) % 12).toBe(0);
		}
	});

	it("can quote you back", () => {
		const mine = yourLine(
			phrase.map((key, i) => ({ key, at: i * 3, length: 3 })),
			1,
			roles.slice(0, 4),
		);

		let yours = 0;

		for (let r = 0; r < 20; r++)
			yours += ask({
				player: "armstrong",
				memory: 2,
				history: phrase.slice(0, 3),
				roles: roles.slice(0, 4),
				yours: [mine],
				random: seeded(r),
			}).notes.filter((n) => n.line.who === "you").length;

		expect(yours).toBeGreaterThan(0);
	});
});

describe("transcription", () => {
	it("writes bars the band can play back at the same times", () => {
		const placed = [
			{ key: 70, at: 0, length: 2 },
			{ key: 72, at: 2, length: 1 },
			{ key: 73, at: 4, length: 5 },
			{ key: 74, at: 12, length: 12 },
			{ key: 67, at: 30, length: 3 },
		];

		const written = bars(placed, 4);

		expect(written[0]).toBe("[bb4@2 c5@2 ~ db5@7 ~@4]");

		const compiled = compileAll({
			tempo: 120,
			swing: 2,
			code: {
				chords: "Bb7",
				you: serialize(written),
				cornet: "",
				clarinet: "",
				trombone: "",
				piano: "",
				banjo: "",
			},
			muted: [],
		});

		const played = [0, 1, 2, 3].flatMap((b) => notes(compiled, "you", b, 2));

		expect(played.map((n) => n.keys[0])).toEqual(placed.map((p) => p.key));

		expect(played.map((n) => Math.round(n.onset * 12))).toEqual(
			placed.map((p) => p.at),
		);
	});

	it("snaps swung playing to the triplet grid", () => {
		expect(slotAt(0.02, 2)).toBe(0);
		expect(slotAt(0.65, 2)).toBe(2);
		expect(slotAt(0.34, 2)).toBe(1);
		expect(slotAt(0.97, 2)).toBe(3);
		expect(slotAt(0.5, 1)).toBe(2);
	});

	it("keeps only notes inside your four", () => {
		const takes = [
			{ key: 70, clock: 3.9, end: 3.95 },
			{ key: 72, clock: 4.0, end: 4.1 },
			{ key: 74, clock: 7.95, end: null },
		];

		expect(transcribe(takes, 4, 4, 7.9, 2).map((n) => n.key)).toEqual([72]);
	});

	it("serializes a whole-bar note and an empty bar", () => {
		expect(bar([{ key: 70, at: 0, length: 12 }])).toBe("bb4");
		expect(bar([])).toBe("~");
	});
});

describe("bars", () => {
	it("merges rests when a note is taken out", () => {
		expect(
			formatBar([
				{ text: "d5", size: 12 },
				{ text: "~", size: 12 },
				{ text: "~", size: 24 },
			]),
		).toBe("[d5 ~@3]");

		expect(formatBar([{ text: "~", size: 48 }])).toBe("~");
	});

	it("splits a bar into steps with their start times", () => {
		const items = itemsOf(parse("[d5 f5 ~ [d5 c5]]"), 0);

		expect(items.map((i) => [i.text, i.begin, i.size])).toEqual([
			["d5", 0, 12],
			["f5", 12, 12],
			["~", 24, 12],
			["d5", 36, 6],
			["c5", 42, 6],
		]);

		expect(formatBar(items)).toBe("[d5@2 f5@2 ~@2 d5 c5]");
	});
});

describe("chord chart", () => {
	it("reads bars back out of the chord line", () => {
		const code = "<Bb7 Eb7 Bb7!2 Eb7!2 Bb7!2 F7 Eb7 Bb7 [Gm7 F7]>";
		const node = compile("chords", code).node;
		const read = barsOf(node);

		expect(read[11]).toBe("[Gm7 F7]");
		expect(serialize(read)).toBe(code);

		expect(
			compile("chords", serialize(barsOf(parse("[Bb7@3 G7]")))).problem,
		).toBeNull();
	});
});

describe("ear", () => {
	it("hears the pitch of a sung note", () => {
		const rate = 48000;
		const data = new Float32Array(2048);

		for (let i = 0; i < data.length; i++)
			data[i] =
				Math.sin((2 * Math.PI * 196 * i) / rate) +
				0.4 * Math.sin((2 * Math.PI * 392 * i) / rate);

		const f = yin(data, rate);

		expect(f).not.toBeNull();
		expect(Math.abs((f ?? 0) - 196)).toBeLessThan(2);
	});

	it("snaps a low voice onto the keys", () => {
		const keys = [67, 70, 72, 73, 74, 75, 77, 79, 80, 82];

		expect(snap(55, keys)).toBe(67);
		expect(snap(58.3, keys)).toBe(70);
		expect(snap(96, keys)).toBe(72);
	});
});

describe("cues", () => {
	it("keeps every cue short enough for a phone", () => {
		for (const p of players) {
			const all = [
				introCue(p),
				waitCue(p, 5),
				...Array.from({ length: 12 }, (_, n) => turnCue(p, n)),
			];

			for (const c of all) expect(c.text.length).toBeLessThanOrEqual(150);
		}
	});
});
