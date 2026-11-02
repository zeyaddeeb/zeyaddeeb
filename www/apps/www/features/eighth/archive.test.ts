import { describe, expect, it } from "vitest";
import { type Archive, parseArchive, replayOf } from "./archive";
import { dot } from "./card";
import { shuffle } from "./deal";
import { type Deck, PRESETS, START } from "./deck";
import type { Deal, Row, Trial } from "./protocol";
import { seeded } from "./seeded";

const asRow = (t: Trial): Row => [
	t.k,
	t.dials[0],
	t.dials[1],
	t.answers[0],
	t.answers[1],
	t.sign,
	5,
	6,
	4,
	7,
	null,
	t.card,
];

const clocks = {
	west: { offset_ns: 0, bound_ns: 300_000, measured: true },
	east: { offset_ns: 0, bound_ns: 200_000, measured: true },
};

function recorded(specs: { id: string; deal: Deal; deck: Deck }[]): Archive {
	return {
		version: 1,
		recorded: "2026-11-03T12:00:00.000Z",
		runs: specs.map((s, i) => ({
			id: s.id,
			deal: s.deal,
			deck: [...s.deck],
			west: "gcp-us-west1",
			east: "gcp-us-east4",
			light_us: 12_025.8,
			clocks,
			rows: shuffle(s.deal, s.deck, seeded(i + 1), 600).map(asRow),
		})),
	};
}

const archive = recorded([
	...PRESETS.map((p) => ({ id: p.id, deal: "deck" as const, deck: p.deck })),
	{ id: "talk", deal: "talk", deck: START },
]);

describe("archive", () => {
	it("accepts its own format and rejects anything else", () => {
		expect(parseArchive(JSON.parse(JSON.stringify(archive)))).not.toBeNull();
		expect(parseArchive({ version: 2, runs: [] })).toBeNull();
		expect(parseArchive(null)).toBeNull();
	});

	it("replays a recorded run as it was when the deck matches", () => {
		const nature = PRESETS.find((p) => p.id === "nature")?.deck ?? START;
		const r = replayOf(archive, "deck", nature, seeded(1), 2400);

		expect(r?.resampled).toBe(false);
		expect(r?.run.id).toBe("nature");
		expect(r?.trials).toHaveLength(600);
		expect(replayOf(archive, "talk", START, seeded(1), 2400)?.run.id).toBe(
			"talk",
		);
	});

	it("re-deals a new deck from recorded trials of the same cards", () => {
		const deck: Deck = [0, 2, -1, 0, 0, 3, 0, 4];
		const r = replayOf(archive, "deck", deck, seeded(2), 2400);

		expect(r?.resampled).toBe(true);
		expect(r?.trials).toHaveLength(2400);

		for (const t of r?.trials ?? []) {
			const card = t.card ?? -1;
			const count = deck[card] ?? 0;

			expect(count).not.toBe(0);
			expect(t.sign).toBe(Math.sign(count));
			expect(t.answers[0]).toBe(dot(card, t.dials[0] ?? 0) ? 1 : 0);
			expect(t.answers[1]).toBe(dot(card, t.dials[1] ?? 0) ? 1 : 0);
		}

		expect(r?.trials.map((t) => t.k)).toEqual([...Array(2400).keys()]);
	});

	it("gives up when a card was never recorded or a deal is missing", () => {
		const one = recorded([
			{ id: "fig-5a", deal: "deck", deck: PRESETS[0].deck },
		]);

		expect(
			replayOf(one, "deck", [1, 0, 0, 1, 0, 0, 0, 0], seeded(3), 10),
		).toBeNull();
		expect(replayOf(one, "dark", START, seeded(3), 10)).toBeNull();
	});
});
