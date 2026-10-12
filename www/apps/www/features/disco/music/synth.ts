import type { Note } from "./arrange";
import {
	flam,
	type Hiss,
	held,
	hissSeconds,
	kit,
	type Ring,
	ringSeconds,
	type TonePatch,
	tails,
	tonePatches,
} from "./patches";
import { hz } from "./pitch";
import { type Drum, drums, isDrum, type Tone, type Voice } from "./voices";

export const polyphony = 24;
export const knee = 0.6;
export const ceiling = 0.88;

const headroom = 2;
const master = 0.8;
const fade = 0.004;

interface Layer {
	sources: AudioScheduledSourceNode[];
	nodes: AudioNode[];
	ends: number;
}

interface Sounding {
	ends: number;
	cut: (at: number) => void;
}

export function limit(x: number): number {
	const size = Math.abs(x);
	const room = ceiling - knee;

	if (size <= knee) return x;

	return Math.sign(x) * (knee + room * Math.tanh((size - knee) / room));
}

function limiter(points = 4097) {
	return Float32Array.from({ length: points }, (_, i) =>
		limit(headroom * ((2 * i) / (points - 1) - 1)),
	);
}

function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
	const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	let seed = 22222;

	for (let i = 0; i < data.length; i++) {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		data[i] = seed / 2 ** 31 - 1;
	}

	return buffer;
}

function envelope(
	ctx: BaseAudioContext,
	patch: TonePatch,
	peak: number,
	when: number,
	end: number,
): GainNode {
	const amp = ctx.createGain();

	amp.gain.value = 0;
	amp.gain.setValueAtTime(0, when);
	amp.gain.linearRampToValueAtTime(peak, when + patch.attack);
	amp.gain.setTargetAtTime(
		peak * patch.sustain,
		when + patch.attack,
		patch.decay,
	);
	amp.gain.setTargetAtTime(0, end, patch.release);

	return amp;
}

function brightness(
	ctx: BaseAudioContext,
	patch: TonePatch,
	f: number,
	when: number,
): BiquadFilterNode {
	const filter = ctx.createBiquadFilter();
	const [open, settled] = patch.cutoff.map((h) => Math.min(9500, f * h));

	filter.type = "lowpass";
	filter.Q.value = 0.7;
	filter.frequency.setValueAtTime(open, when);
	filter.frequency.setTargetAtTime(settled, when, patch.sweep);

	return filter;
}

function vibrato(
	ctx: BaseAudioContext,
	cents: number,
	targets: OscillatorNode[],
	when: number,
	done: number,
): Layer {
	const lfo = ctx.createOscillator();
	const depth = ctx.createGain();

	lfo.frequency.value = 5.5;
	depth.gain.value = 0;
	depth.gain.setValueAtTime(0, when + 0.15);
	depth.gain.linearRampToValueAtTime(cents, when + 0.4);
	lfo.connect(depth);

	for (const target of targets) depth.connect(target.detune);

	lfo.start(when);
	lfo.stop(done);

	return { sources: [lfo], nodes: [depth], ends: done };
}

function ringing(
	ctx: BaseAudioContext,
	ring: Ring,
	when: number,
	out: AudioNode,
): Layer {
	const gain = ctx.createGain();
	const ends = when + ringSeconds(ring);

	gain.gain.value = 0;
	gain.gain.setValueAtTime(ring.level, when);
	gain.gain.setTargetAtTime(0, when, ring.seconds);
	gain.connect(out);

	const sources = ring.pitches.map((pitch) => {
		const osc = ctx.createOscillator();

		osc.type = ring.wave;
		osc.frequency.setValueAtTime(pitch * ring.drop, when);
		osc.frequency.exponentialRampToValueAtTime(pitch, when + ring.fall);
		osc.connect(gain);
		osc.start(when);
		osc.stop(ends);

		return osc;
	});

	return { sources, nodes: [gain], ends };
}

function hissing(
	ctx: BaseAudioContext,
	hiss: Hiss,
	noise: AudioBuffer,
	offset: number,
	when: number,
	out: AudioNode,
): Layer {
	const source = ctx.createBufferSource();
	const filter = ctx.createBiquadFilter();
	const gain = ctx.createGain();
	const tail = when + hiss.flams * flam;
	const ends = when + hissSeconds(hiss);

	source.buffer = noise;
	source.loop = true;
	filter.type = hiss.filter;
	filter.frequency.value = hiss.frequency;
	filter.Q.value = hiss.q;
	gain.gain.value = 0;

	for (let i = 0; i < hiss.flams; i++) {
		gain.gain.setValueAtTime(hiss.level, when + i * flam);
		gain.gain.exponentialRampToValueAtTime(
			hiss.level * 0.1,
			when + (i + 0.8) * flam,
		);
	}

	gain.gain.setValueAtTime(hiss.level, tail);
	gain.gain.setTargetAtTime(0, tail, hiss.seconds);
	source.connect(filter).connect(gain).connect(out);
	source.start(when, offset);
	source.stop(ends);

	return { sources: [source], nodes: [filter, gain], ends };
}

function sounding(layers: Layer[], amp: GainNode): Sounding {
	const sources = layers.flatMap((layer) => layer.sources);
	const nodes = [...sources, ...layers.flatMap((layer) => layer.nodes), amp];
	const ends = Math.max(...layers.map((layer) => layer.ends));
	const last = layers.find((layer) => layer.ends === ends)?.sources[0];

	if (last)
		last.onended = () => {
			for (const node of nodes) node.disconnect();
		};

	return {
		ends,
		cut: (at) => {
			amp.gain.cancelScheduledValues(at);
			amp.gain.setTargetAtTime(0, at, fade);

			for (const source of sources) source.stop(at + fade * tails);
		},
	};
}

export class Synth {
	readonly output: GainNode;
	private readonly mix: GainNode;
	private readonly noise: AudioBuffer;
	private readonly buses = new Map<Voice, AudioNode>();
	private readonly waves = new Map<Tone, PeriodicWave>();
	private live: Sounding[] = [];

	constructor(readonly ctx: BaseAudioContext) {
		const card = ctx.createBiquadFilter();
		const shaper = ctx.createWaveShaper();

		this.mix = ctx.createGain();
		this.output = ctx.createGain();
		this.noise = whiteNoise(ctx);
		this.mix.gain.value = master / headroom;
		card.type = "lowpass";
		card.frequency.value = 10000;
		card.Q.value = 0.7;
		shaper.curve = limiter();
		this.mix.connect(card).connect(shaper).connect(this.output);
	}

	get voices() {
		return this.live.length;
	}

	play(note: Note, when: number, seconds: number) {
		this.reserve(when);

		this.live.push(
			isDrum(note.voice)
				? this.drum(note.voice, note.velocity, when)
				: this.tone(note.voice, note, when, seconds),
		);
	}

	silence() {
		const now = this.ctx.currentTime;

		for (const voice of this.live) voice.cut(now);

		this.live = [];
	}

	private reserve(when: number) {
		this.live = this.live.filter((voice) => voice.ends > when);

		while (this.live.length >= polyphony) this.live.shift()?.cut(when);
	}

	private bus(voice: Voice, pan: number): AudioNode {
		const ready = this.buses.get(voice);

		if (ready) return ready;

		const panner = this.ctx.createStereoPanner();

		panner.pan.value = pan;
		panner.connect(this.mix);
		this.buses.set(voice, panner);

		return panner;
	}

	private wave(voice: Tone): PeriodicWave {
		const ready = this.waves.get(voice);

		if (ready) return ready;

		const { partials } = tonePatches[voice];
		const wave = this.ctx.createPeriodicWave(
			new Float32Array(partials.length + 1),
			new Float32Array([0, ...partials]),
		);

		this.waves.set(voice, wave);

		return wave;
	}

	private oscillators(voice: Tone, f: number, when: number, done: number) {
		const patch = tonePatches[voice];

		return patch.spread.map((cents) => {
			const osc = this.ctx.createOscillator();

			osc.setPeriodicWave(this.wave(voice));
			osc.frequency.value = f;
			osc.detune.setValueAtTime(cents + patch.scoop, when);
			osc.detune.linearRampToValueAtTime(cents, when + 0.04);
			osc.start(when);
			osc.stop(done);

			return osc;
		});
	}

	private tone(voice: Tone, note: Note, when: number, seconds: number) {
		const ctx = this.ctx;
		const patch = tonePatches[voice];
		const f = hz(note.key);
		const end = when + held(patch, seconds);
		const done = end + patch.release * tails;
		const peak = (patch.level * note.velocity) / Math.sqrt(patch.spread.length);
		const amp = envelope(ctx, patch, peak, when, end);
		const filter = brightness(ctx, patch, f, when);
		const oscs = this.oscillators(voice, f, when, done);
		const layers: Layer[] = [{ sources: oscs, nodes: [filter], ends: done }];

		for (const osc of oscs) osc.connect(filter);

		if (patch.vibrato && seconds > 0.3)
			layers.push(vibrato(ctx, patch.vibrato, oscs, when, done));

		filter.connect(amp).connect(this.bus(voice, patch.pan));

		return sounding(layers, amp);
	}

	private drum(voice: Drum, velocity: number, when: number) {
		const ctx = this.ctx;
		const patch = kit[voice];
		const amp = ctx.createGain();
		const offset = drums.indexOf(voice) / drums.length;
		const layers: Layer[] = [];

		amp.gain.value = patch.level * velocity;

		if (patch.ring) layers.push(ringing(ctx, patch.ring, when, amp));

		if (patch.hiss)
			layers.push(hissing(ctx, patch.hiss, this.noise, offset, when, amp));

		amp.connect(this.bus(voice, patch.pan));

		return sounding(layers, amp);
	}
}
