import type { Chart } from "./arrange";
import { type Bars, rest, times } from "./notation";

const song: Bars = ["E7", "Am", "E7", "Am", "Dm", "Am", "E7", "Am"];
const interlude: Bars = ["Am", "Dm", "G7", "C", "F", "Dm", "E7", "E7"];

const melody: Bars = [
	"e5 _ b4 c5 d5 _ c5 b4",
	"a4 _ a4 c5 e5 _ d5 c5",
	"b4 _ _ c5 d5 _ e5 _",
	"c5 _ a4 _ a4 _ _ _",
	"d5 _ _ f5 a5 _ g5 f5",
	"e5 _ _ c5 e5 _ d5 c5",
	"b4 _ b4 c5 d5 _ e5 _",
	"c5 _ a4 _ a4 _ ~ ~",
];

const under: Bars = [
	"g#4 _ g#4 a4 b4 _ a4 g#4",
	"e4 _ e4 a4 c5 _ b4 a4",
	"g#4 _ _ a4 b4 _ g#4 _",
	"a4 _ e4 _ e4 _ _ _",
	"a4 _ _ d5 f5 _ e5 d5",
	"c5 _ _ a4 c5 _ b4 a4",
	"g#4 _ g#4 a4 b4 _ g#4 _",
	"a4 _ e4 _ e4 _ ~ ~",
];

const bridge: Bars = [
	"e5 _ _ _ c5 _ a4 c5",
	"d5 _ _ _ f5 _ e5 d5",
	"d5 _ _ _ b4 _ g4 b4",
	"c5 _ _ _ e5 _ d5 c5",
	"c5 _ _ _ a4 _ f4 a4",
	"a4 _ d5 _ f5 _ a5 _",
	"g#5 _ _ e5 d5 _ b4 _",
	"g#4 _ b4 _ d5 _ ~ ~",
];

const slow = (bar: string): Bars => times(8, [bar]);

export const korobeiniki: Chart = {
	level: 1.33,
	swing: 0.5,
	chords: [...song, ...song, ...interlude],
	parts: [
		{ voice: "pluck", level: 0.62, bars: [...melody, ...rest(16)] },
		{
			voice: "pluck",
			level: 0.46,
			tremolo: 0.25,
			bars: [...rest(8), ...melody, ...bridge],
		},
		{
			voice: "accordion",
			level: 0.5,
			bars: [...rest(8), ...under, ...rest(8)],
		},
		{
			voice: "accordion",
			level: 0.4,
			base: 57,
			gate: 0.5,
			bars: [...slow("~ x ~ x"), ...slow("~ x ~ x ~ x ~ x"), ...rest(8)],
		},
		{
			voice: "accordion",
			level: 0.25,
			base: 57,
			bars: [...rest(16), ...slow("x")],
		},
		{
			voice: "bass",
			level: 0.65,
			base: 45,
			gate: 0.7,
			bars: [...slow("1 ~ 5, ~"), ...slow("1 5, 1 5,"), ...slow("1 ~ 5, ~")],
		},
		{
			voice: "kick",
			level: 0.6,
			bars: [...slow("x ~ x ~"), ...slow("x x x x"), ...slow("x ~ x ~")],
		},
		{
			voice: "tambourine",
			level: 0.35,
			bars: [
				...slow("~ x ~ x"),
				...slow("~ x ~ x ~ x ~ x"),
				...slow("~ x ~ x"),
			],
		},
	],
};
