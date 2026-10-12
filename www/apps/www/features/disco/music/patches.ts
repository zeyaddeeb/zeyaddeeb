import { type Drum, isDrum, type Tone, type Voice } from "./voices";

export const tails = 6;
export const flam = 0.011;

export interface TonePatch {
	partials: number[];
	spread: number[];
	attack: number;
	decay: number;
	sustain: number;
	release: number;
	cutoff: [number, number];
	sweep: number;
	scoop: number;
	vibrato: number;
	level: number;
	pan: number;
}

export interface Ring {
	wave: OscillatorType;
	pitches: number[];
	drop: number;
	fall: number;
	seconds: number;
	level: number;
}

export interface Hiss {
	filter: BiquadFilterType;
	frequency: number;
	q: number;
	flams: number;
	seconds: number;
	level: number;
}

export interface DrumPatch {
	ring?: Ring;
	hiss?: Hiss;
	level: number;
	pan: number;
}

const saw = Array.from({ length: 20 }, (_, i) => 1 / (i + 1));

export const tonePatches: Record<Tone, TonePatch> = {
	piano: {
		partials: [1, 0.6, 0.38, 0.24, 0.16, 0.11, 0.08, 0.05, 0.035, 0.02],
		spread: [-2, 2],
		attack: 0.004,
		decay: 0.4,
		sustain: 0.15,
		release: 0.06,
		cutoff: [14, 6],
		sweep: 0.18,
		scoop: 0,
		vibrato: 0,
		level: 0.5,
		pan: -0.2,
	},
	bass: {
		partials: [1, 0.8, 0.5, 0.35, 0.2, 0.12, 0.08],
		spread: [0],
		attack: 0.006,
		decay: 0.2,
		sustain: 0.55,
		release: 0.04,
		cutoff: [10, 5],
		sweep: 0.07,
		scoop: 0,
		vibrato: 0,
		level: 0.7,
		pan: 0,
	},
	tuba: {
		partials: [1, 0.8, 0.55, 0.36, 0.24, 0.15, 0.09, 0.05],
		spread: [0],
		attack: 0.022,
		decay: 0.15,
		sustain: 0.75,
		release: 0.05,
		cutoff: [3, 7],
		sweep: 0.035,
		scoop: -12,
		vibrato: 0,
		level: 0.7,
		pan: 0,
	},
	brass: {
		partials: saw,
		spread: [0],
		attack: 0.024,
		decay: 0.14,
		sustain: 0.8,
		release: 0.05,
		cutoff: [1.8, 8],
		sweep: 0.03,
		scoop: -18,
		vibrato: 9,
		level: 0.42,
		pan: 0.15,
	},
	sax: {
		partials: [1, 0.85, 0.5, 0.62, 0.34, 0.26, 0.2, 0.13, 0.1, 0.07, 0.04],
		spread: [0],
		attack: 0.022,
		decay: 0.18,
		sustain: 0.82,
		release: 0.06,
		cutoff: [2, 7],
		sweep: 0.045,
		scoop: -25,
		vibrato: 12,
		level: 0.42,
		pan: -0.1,
	},
	accordion: {
		partials: [1, 0.9, 0.72, 0.6, 0.46, 0.4, 0.3, 0.26, 0.18, 0.15, 0.1, 0.08],
		spread: [-6, 6],
		attack: 0.018,
		decay: 0.3,
		sustain: 0.9,
		release: 0.045,
		cutoff: [8, 12],
		sweep: 0.05,
		scoop: 0,
		vibrato: 0,
		level: 0.36,
		pan: 0.1,
	},
	organ: {
		partials: [1, 0.8, 0.45, 0.4, 0, 0.22, 0, 0.18],
		spread: [-3, 3],
		attack: 0.005,
		decay: 0.2,
		sustain: 0.9,
		release: 0.03,
		cutoff: [12, 12],
		sweep: 0.05,
		scoop: 0,
		vibrato: 0,
		level: 0.36,
		pan: 0.3,
	},
	pluck: {
		partials: [1, 0.75, 0.58, 0.42, 0.32, 0.24, 0.17, 0.12, 0.08, 0.05],
		spread: [-3, 3],
		attack: 0.002,
		decay: 0.13,
		sustain: 0.02,
		release: 0.05,
		cutoff: [16, 5],
		sweep: 0.07,
		scoop: 0,
		vibrato: 0,
		level: 0.6,
		pan: -0.1,
	},
	banjo: {
		partials: [1, 0.9, 0.8, 0.62, 0.5, 0.4, 0.3, 0.22, 0.15, 0.1],
		spread: [0],
		attack: 0.002,
		decay: 0.085,
		sustain: 0.02,
		release: 0.04,
		cutoff: [18, 6],
		sweep: 0.05,
		scoop: 0,
		vibrato: 0,
		level: 0.5,
		pan: 0.35,
	},
};

const noise = (
	filter: BiquadFilterType,
	frequency: number,
	q: number,
	seconds: number,
	level = 1,
): Hiss => ({ filter, frequency, q, flams: 0, seconds, level });

const tone = (
	pitches: number[],
	drop: number,
	seconds: number,
	level = 1,
	wave: OscillatorType = "sine",
): Ring => ({ wave, pitches, drop, fall: 0.03, seconds, level });

export const kit: Record<Drum, DrumPatch> = {
	kick: {
		ring: { ...tone([66], 3, 0.07), fall: 0.05 },
		hiss: noise("lowpass", 3000, 0.7, 0.012, 0.8),
		level: 1,
		pan: 0,
	},
	snare: {
		ring: tone([188], 1.5, 0.05, 0.5, "triangle"),
		hiss: noise("bandpass", 3400, 0.6, 0.075),
		level: 0.9,
		pan: 0.05,
	},
	hat: { hiss: noise("highpass", 7200, 0.8, 0.03), level: 1, pan: 0.3 },
	openHat: {
		hiss: noise("highpass", 6600, 0.8, 0.11),
		level: 0.9,
		pan: 0.3,
	},
	clap: {
		hiss: { ...noise("bandpass", 1350, 1.1, 0.07), flams: 2 },
		level: 1.3,
		pan: -0.1,
	},
	clave: { ring: tone([2450], 1, 0.028), level: 0.6, pan: 0.4 },
	cowbell: {
		ring: tone([562, 845], 1, 0.075, 0.5, "square"),
		level: 0.5,
		pan: -0.35,
	},
	congaHigh: {
		ring: tone([335], 1.2, 0.08),
		hiss: noise("bandpass", 2600, 1, 0.006, 0.3),
		level: 0.8,
		pan: 0.25,
	},
	congaLow: {
		ring: tone([218], 1.2, 0.11),
		hiss: noise("bandpass", 1900, 1, 0.006, 0.5),
		level: 0.8,
		pan: 0.4,
	},
	slap: {
		ring: tone([430], 1.3, 0.025, 0.5),
		hiss: noise("bandpass", 2100, 1.4, 0.03),
		level: 1,
		pan: 0.25,
	},
	tambourine: {
		hiss: noise("highpass", 5600, 1.2, 0.07),
		level: 1,
		pan: -0.3,
	},
	woodblock: {
		ring: tone([1180], 1, 0.022),
		hiss: noise("bandpass", 1180, 3, 0.012, 0.4),
		level: 0.7,
		pan: -0.4,
	},
};

export function held(patch: TonePatch, seconds: number): number {
	const rung = patch.sustain < 0.05 ? patch.decay * 5 : seconds;

	return Math.max(Math.min(seconds, rung), patch.attack + 0.01);
}

export const ringSeconds = (ring: Ring) => ring.seconds * tails;

export const hissSeconds = (hiss: Hiss) =>
	hiss.flams * flam + hiss.seconds * tails;

export function lifetime(voice: Voice, seconds: number): number {
	if (!isDrum(voice)) {
		const patch = tonePatches[voice];

		return held(patch, seconds) + patch.release * tails;
	}

	const { ring, hiss } = kit[voice];

	return Math.max(ring ? ringSeconds(ring) : 0, hiss ? hissSeconds(hiss) : 0);
}
