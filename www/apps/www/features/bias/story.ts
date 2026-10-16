import { DRESSED } from "./atelier";
import { type FormId, formOf } from "./forms";
import { grainAt, type Press } from "./net";
import { type Best, type Laid, RECORDS } from "./records-data";

export interface Preset {
	id: string;
	label: string;
	fill: number;
	sewn: Press[];
	view: [number, number];
	caption: string;
}

const press = (
	form: FormId,
	pin: [number, number, number],
	angle: number,
): Press => ({ pin, warp: grainAt(formOf(form), pin, angle) });

export const laid = (form: FormId, layout: Laid[]): Press[] =>
	layout.map(({ pin, grain }) => press(form, pin, (grain * Math.PI) / 180));

export const NOUN: Record<FormId, string> = {
	ball: "ball",
	saddle: "saddle",
	bagel: "bagel",
};

export const PRESETS: Record<FormId, Preset[]> = {
	ball: [
		{
			id: "chebyshev",
			label: "Chebyshev, 1878",
			fill: 0,
			sewn: [press("ball", [0, 0, 1], 0), press("ball", [0, 0, -1], 0)],
			view: [-0.55, 0.42],
			caption:
				"Chebyshev’s ball, 1878: two pieces, one per half, with the threads running corner to corner across each pattern.",
		},
		{
			id: "ghys",
			label: "Ghys, 2011",
			fill: 0,
			sewn: [press("ball", [0, 0, 1], 0)],
			view: [-0.55, -0.62],
			caption:
				"Ghys, 2011: one piece dresses the whole ball. Turn it over: the seam is two arcs crossing at the bottom.",
		},
		{
			id: "turned",
			label: "Two, turned",
			fill: 0.8,
			sewn: [
				press("ball", [0, 0, 1], 0),
				press("ball", [0, 0, -1], Math.PI / 4),
			],
			view: [-0.55, 0.12],
			caption:
				"Thicker thread jams at 37° and Chebyshev’s halves leave a tenth of the ball bare. Turn one 45° and two pieces close again.",
		},
	],
	saddle: [
		{
			id: "one",
			label: "One piece",
			fill: 0.7,
			sewn: [press("saddle", [0, 0, 0], 0)],
			view: [-0.55, 0.62],
			caption:
				"A saddle curves the other way, so its checks lean the other way. Along its dips and rises one piece of cloth is enough.",
		},
	],
	bagel: [
		{
			id: "two",
			label: "Outside and in",
			fill: 0,
			sewn: laid("bagel", RECORDS.bagel[0].layout),
			view: [-0.4, 0.75],
			caption:
				"A bagel is both. Its outside leans the checks like a ball, its hole like a saddle, and the two add up to nothing.",
		},
	],
};

export const OPENING = PRESETS.ball[0];

export function bestFor(form: FormId, fill: number): Best {
	const list = RECORDS[form];

	return list.find((r) => r.fill >= fill - 1e-9) ?? list[list.length - 1];
}

export function fewest(form: FormId, fill: number): Preset {
	const best = bestFor(form, fill);
	const first = PRESETS[form][0];

	return {
		id: "fewest",
		label: "Fewest found",
		fill: best.fill,
		sewn: laid(form, best.layout),
		view: first.view,
		caption: `The fewest pieces a search found for this ${NOUN[form]} with thread that ${best.fill < 0.02 ? "folds flat" : `jams at ${lean(best.fill)}°`}: ${COUNTS[best.pieces - 1] ?? best.pieces}.`,
	};
}

export const lean = (fill: number) =>
	Math.round((Math.acos(fill) * 180) / Math.PI);

const percent = (x: number) => `${Math.floor(x * 100)}%`;

const COUNTS = ["one", "two", "three", "four", "five", "six", "seven", "eight"];

const counted = (n: number) =>
	n === 1 ? "one piece" : `${COUNTS[n - 1] ?? n} pieces`;

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface Reading {
	form: FormId;
	fill: number;
	sewn: number;
	loose: boolean;
	coverage: number;
	preset: Preset | null;
	best: number;
}

function versus(pieces: number, best: number) {
	if (pieces > best)
		return ` The fewest found with this thread is ${COUNTS[best - 1] ?? best}.`;

	if (pieces < best) return " That beats the fewest the search found.";

	return " As few as the search found.";
}

function stop(fill: number) {
	return fill < 0.02
		? "Threads with no width can fold flat, so it stops only where it meets itself."
		: `It stops where the checks lean ${lean(fill)}° and the threads touch.`;
}

export function caption(r: Reading) {
	const noun = NOUN[r.form];
	const total = r.sewn + (r.loose ? 1 : 0);

	if (r.preset) return r.preset.caption;

	if (total === 0) return `Tap the ${noun} to pin a piece of cloth to it.`;

	if (r.coverage >= DRESSED && !r.loose)
		return `Dressed in ${counted(r.sewn)}.${versus(r.sewn, r.best)}`;

	if (r.coverage >= DRESSED)
		return `With this piece the ${noun} is dressed in ${counted(total)}. Sew it on.`;

	if (r.loose && r.sewn === 0)
		return `This piece covers ${percent(r.coverage)} of the ${noun}. ${stop(r.fill)}`;

	return `${capital(counted(total))} ${total === 1 ? "covers" : "cover"} ${percent(r.coverage)} of the ${noun}. Pin another where it shows through.`;
}

export const CAPTIONS = [
	...Object.values(PRESETS).flatMap((list) => list.map((p) => p.caption)),
	"Tap the saddle to pin a piece of cloth to it.",
	"Dressed in seven pieces. The fewest found with this thread is three.",
	"The fewest pieces a search found for this saddle with thread that jams at 26°: three.",
	"With this piece the saddle is dressed in seven pieces. Sew it on.",
	"This piece covers 100% of the saddle. Threads with no width can fold flat, so it stops only where it meets itself.",
	"This piece covers 100% of the saddle. It stops where the checks lean 88° and the threads touch.",
	"Seven pieces cover 100% of the saddle. Pin another where it shows through.",
];

export interface Hint {
	wide: string;
	narrow: string;
}

export const HINTS: Record<"empty" | "loose" | "sewn", Hint> = {
	empty: {
		wide: "Drag to turn it · tap to pin cloth",
		narrow: "Swipe sideways to turn it · tap to pin cloth",
	},
	loose: {
		wide: "Drag the red pin to move it · drag the ring to turn the grain",
		narrow: "Drag the pin to move it · the ring turns it",
	},
	sewn: {
		wide: "Drag to turn it · tap to pin the next piece",
		narrow: "Swipe sideways to turn it · tap to pin more",
	},
};
