import { z } from "zod";
import { type Deck, draw } from "./deck";
import type { Random } from "./nature";
import {
	type Clock,
	clock,
	DEALS,
	type Deal,
	row,
	type Trial,
	trial,
} from "./protocol";

export const ARCHIVE_URL = "/minus-one-eighth/recorded.json";

const archived = z.object({
	version: z.literal(1),
	recorded: z.string(),
	runs: z.array(
		z.object({
			id: z.string(),
			deal: z.enum(DEALS),
			deck: z.array(z.number().int()).length(8),
			west: z.string(),
			east: z.string(),
			light_us: z.number(),
			clocks: z.object({ west: clock, east: clock }),
			rows: z.array(row),
		}),
	),
});

export type Archive = z.infer<typeof archived>;
export type ArchivedRun = Archive["runs"][number];

export interface Replayed {
	run: ArchivedRun;
	trials: Trial[];
	clocks: { west: Clock; east: Clock };
	resampled: boolean;
	pool: number;
}

export function parseArchive(value: unknown): Archive | null {
	const parsed = archived.safeParse(value);

	return parsed.success ? parsed.data : null;
}

const same = (a: Deck, b: readonly number[]) => a.every((c, i) => c === b[i]);

const usable = (t: Trial) =>
	t.card !== null &&
	t.dials[0] !== null &&
	t.dials[1] !== null &&
	t.answers[0] !== 2 &&
	t.answers[1] !== 2;

function loosest(runs: readonly ArchivedRun[]) {
	const worst = (side: "west" | "east"): Clock => ({
		offset_ns: 0,
		bound_ns: Math.max(...runs.map((r) => r.clocks[side].bound_ns)),
		measured: runs.every((r) => r.clocks[side].measured),
	});

	return { west: worst("west"), east: worst("east") };
}

export function replayOf(
	archive: Archive,
	deal: Deal,
	deck: Deck,
	random: Random,
	n: number,
): Replayed | null {
	const exact = archive.runs.find(
		(r) => r.deal === deal && (deal !== "deck" || same(deck, r.deck)),
	);

	if (exact)
		return {
			run: exact,
			trials: exact.rows.map(trial),
			clocks: exact.clocks,
			resampled: false,
			pool: exact.rows.length,
		};

	if (deal !== "deck") return null;

	const decks = archive.runs.filter((r) => r.deal === "deck");
	const [first] = decks;
	const pools = new Map<number, Trial[]>();

	for (const r of decks)
		for (const t of r.rows.map(trial))
			if (usable(t) && t.card !== null)
				pools.set(t.card, [...(pools.get(t.card) ?? []), t]);

	if (!first || deck.some((c, card) => c !== 0 && !pools.get(card)?.length))
		return null;

	const trials = Array.from({ length: n }, (_, k) => {
		const { card, sign } = draw(deck, random);
		const pool = pools.get(card) ?? [];
		const picked = pool[Math.floor(random() * pool.length)];

		return picked ? { ...picked, k, sign } : null;
	}).filter((t): t is Trial => t !== null);

	return {
		run: first,
		trials,
		clocks: loosest(decks),
		resampled: true,
		pool: [...pools.values()].reduce((sum, p) => sum + p.length, 0),
	};
}

let cached: Promise<Archive | null> | null = null;

export function loadArchive() {
	cached ??= fetch(ARCHIVE_URL, { cache: "force-cache" })
		.then((r) => (r.ok ? r.json() : null))
		.then(parseArchive)
		.catch(() => null);

	return cached;
}

export function recordedOn(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
