import type { Chart } from "./arrange";
import { type Bars, rest, times } from "./notation";

const verse: Bars = ["C", "G7", "G7", "C", "C", "F", "G7", "C"];
const trio: Bars = ["F", "F", "C7", "C7", "C7", "C7", "F"];

const hop: Bars = [
	"c5 e5 g5 e5 c6 _ g5 _",
	"b4 d5 g5 d5 b5 _ g5 _",
	"f5 a5 g5 f5 e5 d5 c5 b4",
	"c5 _ e5 _ c5 _ ~ ~",
	"c5 e5 g5 e5 c6 _ g5 _",
	"c5 f5 a5 f5 c6 _ a5 _",
	"b5 a5 g5 f5 e5 d5 b4 d5",
	"c5 _ g4 _ c5 _ ~ ~",
];

const hopUnder: Bars = [
	"g4 c5 e5 c5 g5 _ e5 _",
	"g4 b4 d5 b4 g5 _ d5 _",
	"d5 f5 e5 d5 c5 b4 a4 g4",
	"e4 _ g4 _ e4 _ ~ ~",
	"g4 c5 e5 c5 g5 _ e5 _",
	"a4 c5 f5 c5 a5 _ f5 _",
	"g5 f5 e5 d5 c5 b4 g4 b4",
	"e4 _ e4 _ e4 _ ~ ~",
];

const glide: Bars = [
	"a5 _ _ _ g5 _ f5 _",
	"c5 _ _ _ f5 _ a5 _",
	"g5 _ _ _ f5 _ e5 _",
	"bb4 _ _ _ e5 _ g5 _",
	"bb5 _ _ _ a5 _ g5 _",
	"e5 _ g5 _ bb5 _ g5 _",
	"a5 _ _ _ f5 _ c5 _",
];

const glideUnder: Bars = [
	"f5 _ _ _ e5 _ c5 _",
	"a4 _ _ _ c5 _ f5 _",
	"e5 _ _ _ d5 _ c5 _",
	"g4 _ _ _ c5 _ e5 _",
	"g5 _ _ _ f5 _ e5 _",
	"c5 _ e5 _ g5 _ e5 _",
	"f5 _ _ _ c5 _ a4 _",
];

export const polka: Chart = {
	level: 1.33,
	swing: 0.5,
	chords: [...verse, ...verse, ...trio, "F", ...trio, "F G7"],
	parts: [
		{
			voice: "accordion",
			level: 0.62,
			bars: [
				...hop,
				...hop,
				...glide,
				"f5 _ _ _ _ _ ~ ~",
				...glide,
				"f5 _ _ _ g5 _ b4 d5",
			],
		},
		{
			voice: "accordion",
			level: 0.4,
			bars: [
				...rest(8),
				...hopUnder,
				...rest(8),
				...glideUnder,
				"a4 _ _ _ d5 _ g4 b4",
			],
		},
		{
			voice: "accordion",
			level: 0.3,
			base: 55,
			gate: 0.5,
			bars: ["~ x ~ x ~ x ~ x"],
		},
		{ voice: "tuba", level: 0.55, base: 43, gate: 0.7, bars: ["1 5, 1 5,"] },
		{ voice: "kick", level: 0.55, bars: ["x x x x"] },
		{ voice: "snare", level: 0.5, bars: ["~ x ~ x ~ x ~ x"] },
		{
			voice: "tambourine",
			level: 0.3,
			bars: [
				...rest(8),
				...times(8, ["x o x o x o x o"]),
				...rest(8),
				...times(8, ["x o x o x o x o"]),
			],
		},
	],
};
