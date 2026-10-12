import type { Chart } from "./arrange";
import { type Bars, times } from "./notation";

const blues: Bars = [
	"A",
	"A",
	"A",
	"A7",
	"D7",
	"D7",
	"A",
	"A",
	"E7",
	"D7",
	"A",
	"E7",
];

const head: Bars = [
	"a4 ~ a4 c5 c#5 _ e5 _",
	"f#5 _ e5 _ c#5 a4 ~ ~",
	"a4 ~ a4 c5 c#5 _ e5 _",
	"g5 _ e5 _ c#5 a4 ~ ~",
	"a4 ~ a4 c5 d5 _ f#5 _",
	"a5 _ f#5 _ d5 c5 ~ ~",
	"a4 ~ a4 c5 c#5 _ e5 _",
	"f#5 _ e5 _ c#5 a4 ~ ~",
	"b4 ~ b4 d5 e5 _ g#5 _",
	"f#5 _ d5 _ c5 a4 ~ ~",
	"a4 _ c5 c#5 e5 _ a5 _",
	"e5 _ d5 b4 g#4 _ e4 _",
];

const honks: Bars = [
	"e5 ~ e5 ~ e5 e5 ~ e5",
	"~ e5 ~ e5 g5 _ e5 _",
	"e5 ~ e5 ~ e5 e5 ~ e5",
	"~ e5 ~ e5 g5 _ a5 _",
	"f#5 ~ f#5 ~ f#5 f#5 ~ f#5",
	"~ f#5 ~ f#5 a5 _ f#5 _",
	"e5 ~ e5 ~ e5 e5 ~ e5",
	"~ e5 ~ e5 g5 _ e5 _",
	"e5 ~ g#5 ~ e5 d5 b4 _",
	"d5 ~ f#5 ~ d5 c5 a4 _",
	"a4 c5 c#5 e5 f#5 e5 c#5 a4",
	"b4 _ ~ ~ e4 _ g#4 _",
];

const walk: Bars = [
	...times(4, ["1 3 5 6", "7 6 5 3"]),
	...times(3, ["1 3 5 6"]),
	"1 3 5 7",
];

const backbeat: Bars = [...times(11, ["~ X ~ X"]), "~ X X X"];

export const twist: Chart = {
	level: 0.93,
	swing: 2 / 3,
	chords: [...blues, ...blues],
	parts: [
		{ voice: "sax", level: 0.68, bars: [...head, ...honks] },
		{
			voice: "piano",
			level: 0.32,
			base: 50,
			gate: 0.7,
			bars: ["1+5 1+5 1+6 1+6 1+5 1+5 1+6 1+6"],
		},
		{ voice: "bass", level: 0.65, base: 38, bars: walk },
		{ voice: "kick", level: 0.7, bars: ["x ~ x ~"] },
		{ voice: "snare", level: 0.6, bars: backbeat },
		{ voice: "hat", level: 0.35, bars: ["x o x o x o x o"] },
		{ voice: "tambourine", level: 0.3, bars: ["~ x ~ x"] },
	],
};
