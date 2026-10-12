import type { Chart } from "./arrange";
import { type Bars, rest, times } from "./notation";

const strain: Bars = ["F", "F", "Bb", "Bbm", "F", "D7", "G7 C7", "F C7"];
const bridge: Bars = ["A7", "A7", "D7", "D7", "G7", "G7", "C7", "C7"];

const theme: Bars = [
	"c5 _ _ a4 _ _ _ _",
	"d5 _ _ c5 _ _ a4 c5",
	"f5 _ _ d5 _ _ _ _",
	"f5 _ _ db5 _ _ eb5 db5",
	"c5 _ _ a4 _ _ _ _",
	"c5 _ _ a4 _ _ f#4 a4",
	"b4 _ _ bb4 _ _ g4 e4",
];

const around = "f4 _ _ ~ ~ ~ a4 bb4";
const away = "f4 _ _ ~ ~ ~ c5 d5";

const release: Bars = [
	"e5 _ _ c#5 _ _ _ _",
	"e5 _ c#5 _ a4 _ g4 _",
	"f#4 _ _ a4 _ _ _ _",
	"c5 _ a4 _ f#4 _ a4 _",
	"d5 _ _ b4 _ _ _ _",
	"d5 _ b4 _ g4 _ f4 _",
	"e4 _ _ g4 _ _ _ _",
	"bb4 _ g4 _ ~ ~ a4 bb4",
];

const answers: Bars = [
	"~ ~ ~ ~ c6 a5 f5 a5",
	"~",
	"~ ~ ~ ~ d6 bb5 f5 bb5",
	"~",
	"~ ~ ~ ~ c6 a5 f5 a5",
	"~",
	"~",
	"~ ~ ~ c6 a5 f5 ~ ~",
];

const twoBeat: Bars = [...times(6, ["1 ~ 5, ~"]), "1 ~ 1 ~", "1 ~ 1 ~"];
const brushes: Bars = [...times(7, ["~ o ~ o"]), "~ o x X"];

export const charleston: Chart = {
	level: 0.94,
	swing: 0.58,
	chords: [...strain, ...strain, ...bridge, ...strain],
	parts: [
		{
			voice: "brass",
			level: 0.6,
			bars: [...theme, around, ...theme, away, ...release, ...theme, around],
		},
		{
			voice: "sax",
			level: 0.6,
			bars: [...rest(8), ...answers, ...rest(8), ...answers],
		},
		{
			voice: "piano",
			level: 0.4,
			base: 53,
			lead: 0.5,
			gate: 0.8,
			bars: ["x _ ~ x _ _ ~ ~"],
		},
		{ voice: "banjo", level: 0.4, base: 57, gate: 0.5, bars: ["x x x x"] },
		{
			voice: "tuba",
			level: 0.8,
			base: 41,
			gate: 0.7,
			bars: [...twoBeat, ...twoBeat, ...times(8, ["1 ~ 5, ~"]), ...twoBeat],
		},
		{ voice: "kick", level: 0.65, bars: ["x ~ x ~"] },
		{ voice: "hat", level: 0.4, bars: ["~ x ~ x"] },
		{ voice: "snare", level: 0.5, bars: brushes },
		{ voice: "woodblock", level: 0.5, bars: ["x ~ ~ x ~ ~ ~ ~"] },
	],
};
