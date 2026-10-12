import type { Chart } from "./arrange";
import { type Bars, rest, times } from "./notation";

const hook: Bars = [
	"a4 ~ a4 ~ c5 ~ a4 e5 _ _ ~ ~ d5 ~ c5 ~",
	"b4 ~ b4 ~ d5 ~ b4 g5 _ _ ~ ~ d5 ~ b4 ~",
	"a4 ~ a4 ~ c5 ~ a4 f5 _ _ ~ ~ e5 ~ c5 ~",
	"b4 ~ b4 ~ g#4 ~ b4 e5 _ _ _ _ ~ ~ ~ ~",
];

const answer: Bars = [
	"e5 ~ e5 ~ a5 ~ e5 c5 _ _ ~ ~ d5 ~ e5 ~",
	"d5 ~ d5 ~ g5 ~ d5 b4 _ _ ~ ~ c5 ~ d5 ~",
	"c5 ~ c5 ~ f5 ~ c5 a4 _ _ ~ ~ b4 ~ c5 ~",
	"b4 ~ e5 ~ g#5 ~ e5 b4 _ _ _ _ ~ ~ ~ ~",
];

const chant: Bars = [
	"c5+e5 _ _ _ ~ ~ c5+e5 _ _ _ ~ ~ c5+e5 _ ~ ~",
	"b4+d5 _ _ _ ~ ~ b4+d5 _ _ _ ~ ~ b4+d5 _ ~ ~",
	"a4+c5 _ _ _ ~ ~ a4+c5 _ _ _ ~ ~ a4+c5 _ ~ ~",
	"g#4+b4 _ _ _ ~ ~ g#4+b4 _ _ _ ~ ~ b4+e5 _ ~ ~",
];

const fills: Bars = [
	"~ ~ ~ ~ a5 e5 ~ ~ ~ ~ a5 e5 ~ ~ a5 c6",
	"~ ~ ~ ~ g5 d5 ~ ~ ~ ~ g5 d5 ~ ~ g5 b5",
	"~ ~ ~ ~ f5 c5 ~ ~ ~ ~ f5 c5 ~ ~ f5 a5",
	"~ ~ ~ ~ e5 b4 ~ ~ ~ ~ e5 b4 ~ ~ ~ ~",
];

const sparkle: Bars = [
	"a5 ~ a5 ~ c6 ~ a5 e6 _ _ ~ ~ d6 ~ c6 ~",
	"b5 ~ b5 ~ d6 ~ b5 g6 _ _ ~ ~ d6 ~ b5 ~",
	"a5 ~ a5 ~ c6 ~ a5 f6 _ _ ~ ~ e6 ~ c6 ~",
	"b5 ~ b5 ~ g#5 ~ b5 e6 _ _ _ _ ~ ~ ~ ~",
];

export const fiesta: Chart = {
	level: 1.03,
	swing: 0.5,
	chords: times(4, ["Am", "G", "F", "E"]),
	parts: [
		{
			voice: "brass",
			level: 0.68,
			bars: [...hook, ...answer, ...chant, ...hook],
		},
		{
			voice: "pluck",
			level: 0.5,
			bars: [...rest(8), ...fills, ...sparkle],
		},
		{
			voice: "organ",
			level: 0.36,
			base: 57,
			gate: 0.45,
			bars: ["~ x ~ x ~ x ~ x"],
		},
		{
			voice: "bass",
			level: 0.68,
			base: 36,
			gate: 0.8,
			bars: ["1 _ ~ 1 ~ ~ 5 _ ~ ~ 1' ~ 5 ~ 3 ~"],
		},
		{ voice: "kick", level: 0.75, bars: ["x x x x"] },
		{ voice: "clap", level: 0.9, bars: ["~ x ~ x"] },
		{ voice: "openHat", level: 0.3, bars: ["~ x ~ x ~ x ~ x"] },
		{
			voice: "hat",
			level: 0.25,
			bars: ["x o ~ o x o ~ o x o ~ o x o ~ o"],
		},
		{
			voice: "clave",
			level: 0.4,
			bars: ["x ~ ~ x ~ ~ x ~ ~ ~ x ~ x ~ ~ ~"],
		},
		{
			voice: "congaHigh",
			level: 0.45,
			bars: ["~ ~ ~ x ~ ~ x ~ ~ ~ ~ x ~ ~ ~ ~"],
		},
		{
			voice: "congaLow",
			level: 0.45,
			bars: ["~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ x x"],
		},
	],
};
