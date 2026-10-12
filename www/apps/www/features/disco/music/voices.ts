export const tones = [
	"piano",
	"bass",
	"tuba",
	"brass",
	"sax",
	"accordion",
	"organ",
	"pluck",
	"banjo",
] as const;

export const drums = [
	"kick",
	"snare",
	"hat",
	"openHat",
	"clap",
	"clave",
	"cowbell",
	"congaHigh",
	"congaLow",
	"slap",
	"tambourine",
	"woodblock",
] as const;

export type Tone = (typeof tones)[number];
export type Drum = (typeof drums)[number];
export type Voice = Tone | Drum;

export const voices: readonly Voice[] = [...tones, ...drums];

export const isDrum = (voice: Voice): voice is Drum =>
	(drums as readonly Voice[]).includes(voice);
