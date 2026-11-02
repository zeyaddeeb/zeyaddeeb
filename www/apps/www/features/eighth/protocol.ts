import { z } from "zod";

export const DEALS = ["deck", "talk", "dark", "fixed"] as const;

export type Deal = (typeof DEALS)[number];

const clock = z.object({
	offset_ns: z.number(),
	bound_ns: z.number(),
	measured: z.boolean(),
});

const seen = z.object({
	site: z.string(),
	live: z.boolean(),
	rtt_us: z.number().nullable(),
	clock: clock.nullable(),
});

const us = z.number().nullable();

export const row = z.tuple(
	[
		z.number(),
		z.number().nullable(),
		z.number().nullable(),
		z.number(),
		z.number(),
		z.number(),
		us,
		us,
		us,
		us,
		us,
	],
	z.number().nullable(),
);

const event = z.discriminatedUnion("type", [
	z.object({ type: z.literal("sites"), sites: z.array(seen) }),
	z.object({ type: z.literal("refused"), reason: z.string() }),
	z.object({
		type: z.literal("start"),
		run: z.string(),
		deal: z.enum(DEALS),
		west: z.string(),
		east: z.string(),
		least_km: z.number(),
		light_us: z.number(),
		pairs: z.number(),
		spacing_us: z.number(),
	}),
	z.object({ type: z.literal("clocks"), west: clock, east: clock }),
	z.object({ type: z.literal("trials"), rows: z.array(row) }),
	z.object({
		type: z.literal("lost"),
		site: z.string(),
		after: z.number().nullable(),
	}),
	z.object({ type: z.literal("done"), west: z.number(), east: z.number() }),
]);

export { clock };

export const sitesReply = z.object({ sites: z.array(seen) });

export const sitesStatus = sitesReply.extend({ off: z.boolean() });

export type Clock = z.infer<typeof clock>;
export type Seen = z.infer<typeof seen>;
export type Row = z.infer<typeof row>;
export type Event = z.infer<typeof event>;

export type Answer = 0 | 1 | 2;

export interface Trial {
	k: number;
	dials: [number | null, number | null];
	answers: [Answer, Answer];
	sign: number;
	card: number | null;
	west: { dial: number | null; commit: number | null; heard: number | null };
	east: { dial: number | null; commit: number | null };
}

const answer = (code: number): Answer => (code === 0 || code === 1 ? code : 2);

export function trial(r: Row): Trial {
	return {
		k: r[0],
		dials: [r[1], r[2]],
		answers: [answer(r[3]), answer(r[4])],
		sign: r[5] < 0 ? -1 : 1,
		card: r[11] ?? null,
		west: { dial: r[6], commit: r[7], heard: r[10] },
		east: { dial: r[8], commit: r[9] },
	};
}

export function parse(line: string): Event | null {
	try {
		const parsed = event.safeParse(JSON.parse(line));

		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}
