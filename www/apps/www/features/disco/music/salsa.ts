import type { Chart } from "./arrange";
import { type Bars, rest, times } from "./notation";

const vamp: Bars = ["Am", "Dm", "E7", "Am"];
const mambo: Bars = ["Dm", "G7", "C", "F", "Dm", "E7", "Am", "E7"];

const call: Bars = [
	"~ ~ e5 _ e5 _ c5 d5",
	"f5 _ _ e5 _ _ d5 _",
	"~ ~ d5 _ b4 _ g#4 b4",
	"a4 _ _ c5 _ _ e5 _",
	"~ ~ a5 _ a5 _ g5 f5",
	"e5 _ _ d5 _ _ f5 _",
	"~ ~ e5 _ d5 _ c5 b4",
	"a4 _ _ _ _ _ ~ ~",
];

const callUnder: Bars = [
	"~ ~ c5 _ c5 _ a4 b4",
	"d5 _ _ c5 _ _ a4 _",
	"~ ~ b4 _ g#4 _ e4 g#4",
	"e4 _ _ a4 _ _ c5 _",
	"~ ~ e5 _ e5 _ e5 d5",
	"c5 _ _ a4 _ _ d5 _",
	"~ ~ b4 _ b4 _ a4 g#4",
	"e4 _ _ _ _ _ ~ ~",
];

const reply: Bars = [
	"~ ~ c5 _ e5 _ a5 _",
	"g5 _ _ f5 _ _ d5 _",
	"~ ~ b4 _ d5 _ g#5 _",
	"f5 _ _ e5 _ _ c5 _",
	"~ ~ c5 _ e5 _ a5 _",
	"a5 _ _ f5 _ _ d5 _",
	"~ ~ e5 _ d5 _ b4 g#4",
	"a4 _ _ _ _ _ ~ ~",
];

const replyUnder: Bars = [
	"~ ~ a4 _ c5 _ e5 _",
	"e5 _ _ d5 _ _ a4 _",
	"~ ~ g#4 _ b4 _ e5 _",
	"d5 _ _ c5 _ _ a4 _",
	"~ ~ a4 _ c5 _ e5 _",
	"f5 _ _ d5 _ _ a4 _",
	"~ ~ b4 _ b4 _ g#4 e4",
	"e4 _ _ _ _ _ ~ ~",
];

const riff: Bars = [
	"~ ~ a4 ~ a4 ~ d5 ~",
	"f5 _ _ d5 _ _ b4 _",
	"~ ~ g4 ~ g4 ~ c5 ~",
	"e5 _ _ c5 _ _ a4 _",
	"~ ~ f4 ~ f4 ~ a4 ~",
	"d5 _ _ b4 _ _ g#4 _",
	"~ ~ e5 ~ e5 ~ a5 ~",
	"g#5 _ _ e5 _ _ b4 _",
];

const riffUnder: Bars = [
	"~ ~ f4 ~ f4 ~ a4 ~",
	"d5 _ _ b4 _ _ g4 _",
	"~ ~ e4 ~ e4 ~ g4 ~",
	"c5 _ _ a4 _ _ f4 _",
	"~ ~ d4 ~ d4 ~ f4 ~",
	"b4 _ _ g#4 _ _ e4 _",
	"~ ~ c5 ~ c5 ~ e5 ~",
	"e5 _ _ b4 _ _ g#4 _",
];

const montuno: Bars = [
	"a3+a4! ~ c4+e4 a3+a4! ~ c4+e4 ~ a3+a4!",
	"_ d4+f4 ~ a3+a4! ~ d4+f4 ~ g#3+g#4!",
	"g#3+g#4! ~ b3+d4 g#3+g#4! ~ b3+d4 ~ a3+a4!",
	"_ c4+e4 ~ a3+a4! ~ c4+e4 ~ a3+a4!",
];

const mamboMontuno: Bars = [
	"a3+a4! ~ d4+f4 a3+a4! ~ d4+f4 ~ g3+g4!",
	"_ b3+f4 ~ g3+g4! ~ b3+f4 ~ g3+g4!",
	"g3+g4! ~ c4+e4 g3+g4! ~ c4+e4 ~ a3+a4!",
	"_ c4+f4 ~ a3+a4! ~ c4+f4 ~ a3+a4!",
	"a3+a4! ~ d4+f4 a3+a4! ~ d4+f4 ~ g#3+g#4!",
	"_ b3+d4 ~ g#3+g#4! ~ b3+d4 ~ a3+a4!",
	"a3+a4! ~ c4+e4 a3+a4! ~ c4+e4 ~ g#3+g#4!",
	"_ b3+d4 ~ g#3+g#4! ~ b3+d4 ~ a3+a4!",
];

export const salsa: Chart = {
	level: 0.86,
	swing: 0.5,
	chords: [...times(4, vamp), ...mambo, ...times(2, vamp)],
	parts: [
		{
			voice: "brass",
			level: 0.7,
			bars: [...call, ...reply, ...riff, ...call],
		},
		{
			voice: "brass",
			level: 0.5,
			bars: [...rest(8), ...replyUnder, ...riffUnder, ...callUnder],
		},
		{
			voice: "piano",
			level: 0.36,
			bars: [...times(4, montuno), ...mamboMontuno, ...times(2, montuno)],
		},
		{
			voice: "bass",
			level: 0.8,
			base: 36,
			lead: 1,
			gate: 0.95,
			bars: ["_ _ _ 5 _ _ 1 _"],
		},
		{
			voice: "clave",
			level: 0.5,
			bars: ["~ ~ x ~ x ~ ~ ~", "x ~ ~ x ~ ~ x ~"],
		},
		{ voice: "cowbell", level: 0.5, bars: ["X ~ o o X ~ o o"] },
		{ voice: "congaHigh", level: 0.6, bars: ["~ ~ ~ ~ ~ ~ x x"] },
		{ voice: "congaLow", level: 0.6, bars: ["~", "~ ~ ~ ~ x x ~ ~"] },
		{ voice: "slap", level: 0.8, bars: ["~ ~ x ~ ~ ~ ~ ~"] },
		{ voice: "hat", level: 0.35, bars: ["x o x o x o x o"] },
	],
};
