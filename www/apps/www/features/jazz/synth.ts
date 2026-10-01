import type { Voice } from "./score";

const hz = (key: number) => 440 * 2 ** ((key - 69) / 12);

interface Horn {
	partials: number[] | "saw";
	detune: number;
	bright: number;
	body: number;
	attack: number;
	scoop: number;
	vibrato: { rate: number; depth: number; delay: number };
	breath: number;
	level: number;
	pan: number;
}

type HornVoice = "cornet" | "clarinet" | "trombone" | "you";

const horns: Record<HornVoice, Horn> = {
	cornet: {
		partials: "saw",
		detune: 5,
		bright: 7,
		body: 1250,
		attack: 0.022,
		scoop: -45,
		vibrato: { rate: 5.4, depth: 11, delay: 0.22 },
		breath: 0.02,
		level: 0.34,
		pan: 0.12,
	},
	you: {
		partials: "saw",
		detune: 4,
		bright: 6,
		body: 1150,
		attack: 0.02,
		scoop: -35,
		vibrato: { rate: 5.1, depth: 9, delay: 0.26 },
		breath: 0.024,
		level: 0.34,
		pan: -0.3,
	},
	clarinet: {
		partials: [1, 0, 0.5, 0, 0.32, 0, 0.2, 0, 0.13, 0, 0.08, 0, 0.05],
		detune: 3,
		bright: 6,
		body: 1600,
		attack: 0.03,
		scoop: -20,
		vibrato: { rate: 6.2, depth: 22, delay: 0.14 },
		breath: 0.035,
		level: 0.27,
		pan: 0.38,
	},
	trombone: {
		partials: "saw",
		detune: 7,
		bright: 5,
		body: 520,
		attack: 0.045,
		scoop: -70,
		vibrato: { rate: 4.8, depth: 9, delay: 0.3 },
		breath: 0.015,
		level: 0.17,
		pan: -0.38,
	},
};

interface Pluck {
	seconds: [number, number];
	pick: number;
	soft: number;
	detune: number;
	level: number;
	pan: number;
}

const strings: Record<"piano" | "banjo", Pluck> = {
	piano: {
		seconds: [3.2, 1.1],
		pick: 0.13,
		soft: 0.55,
		detune: 7,
		level: 0.62,
		pan: -0.18,
	},
	banjo: {
		seconds: [0.9, 0.45],
		pick: 0.07,
		soft: 0.08,
		detune: 0,
		level: 0.72,
		pan: 0.2,
	},
};

export interface Sound {
	voice: Voice | "you";
	keys: number[];
	slide: number | null;
	when: number;
	duration: number;
	velocity: number;
}

export class Band {
	readonly ctx: AudioContext;
	private readonly out: GainNode;
	private readonly buses = new Map<string, AudioNode>();
	private readonly plucks = new Map<string, AudioBuffer>();
	private readonly waves = new Map<string, PeriodicWave>();
	private noise: AudioBuffer;

	constructor(context = new AudioContext({ latencyHint: "interactive" })) {
		this.ctx = context;

		const ctx = context;
		const compressor = ctx.createDynamicsCompressor();

		compressor.threshold.value = -18;
		compressor.knee.value = 6;
		compressor.ratio.value = 4;
		compressor.attack.value = 0.01;
		compressor.release.value = 0.2;
		this.out = ctx.createGain();
		this.out.gain.value = 0.62;

		const room = ctx.createConvolver();

		room.buffer = this.room(1.6);

		const wet = ctx.createGain();

		wet.gain.value = 0.2;
		this.out.connect(compressor);
		this.out.connect(room).connect(wet).connect(compressor);
		compressor.connect(ctx.destination);
		this.noise = this.whiteNoise(1);
	}

	get latency() {
		return this.ctx.outputLatency || this.ctx.baseLatency || 0;
	}

	async resume() {
		if (this.ctx.state !== "running") await this.ctx.resume();
	}

	close() {
		this.ctx.close();
	}

	play(sound: Sound) {
		if (sound.voice === "piano" || sound.voice === "banjo")
			this.string(sound.voice, sound);
		else for (const key of sound.keys) this.horn(sound.voice, key, sound);
	}

	clap(when: number, velocity = 1) {
		const ctx = this.ctx;
		const filter = ctx.createBiquadFilter();

		filter.type = "bandpass";
		filter.frequency.value = 1400;
		filter.Q.value = 0.9;

		const gain = ctx.createGain();

		gain.gain.value = 0;

		for (const [offset, level] of [
			[0, 1],
			[0.011, 0.8],
			[0.022, 1],
		]) {
			gain.gain.setValueAtTime(0.5 * level * velocity, when + offset);
			gain.gain.exponentialRampToValueAtTime(0.02, when + offset + 0.009);
		}

		gain.gain.setValueAtTime(0.4 * velocity, when + 0.033);
		gain.gain.exponentialRampToValueAtTime(0.0005, when + 0.2);

		const source = ctx.createBufferSource();

		source.buffer = this.noise;
		source.connect(filter).connect(gain).connect(this.bus("clap", 0));
		source.start(when);
		source.stop(when + 0.25);
	}

	private bus(name: string, pan: number) {
		let node = this.buses.get(name);

		if (!node) {
			const panner = this.ctx.createStereoPanner();

			panner.pan.value = pan;
			panner.connect(this.out);
			node = panner;
			this.buses.set(name, node);
		}

		return node;
	}

	private wave(voice: string, partials: number[]) {
		let wave = this.waves.get(voice);

		if (!wave) {
			const real = new Float32Array(partials.length + 1);
			const imag = new Float32Array([0, ...partials]);

			wave = this.ctx.createPeriodicWave(real, imag);
			this.waves.set(voice, wave);
		}

		return wave;
	}

	hold(key: number, velocity = 0.95) {
		const when = this.ctx.currentTime + 0.005;

		return this.horn("you", key, {
			voice: "you",
			keys: [key],
			slide: null,
			when,
			duration: 30,
			velocity,
		});
	}

	private horn(voice: HornVoice, key: number, sound: Sound) {
		const ctx = this.ctx;
		const spec = horns[voice];
		const { when, velocity } = sound;
		const duration = Math.max(0.06, sound.duration);
		const short = duration < 0.22;
		const attack = short ? Math.min(spec.attack, 0.014) : spec.attack;
		const release = short ? 0.05 : 0.11;
		const end = when + duration;
		const f = hz(key);

		const amp = ctx.createGain();

		amp.gain.setValueAtTime(0, when);
		amp.gain.linearRampToValueAtTime(spec.level * velocity, when + attack);
		amp.gain.setTargetAtTime(spec.level * velocity * 0.78, when + attack, 0.12);
		amp.gain.setTargetAtTime(0, end, release / 3);

		const filter = ctx.createBiquadFilter();

		filter.type = "lowpass";
		filter.Q.value = 0.9;

		const top = Math.min(9000, f * spec.bright * (0.65 + 0.5 * velocity));

		filter.frequency.setValueAtTime(f * 1.5, when);
		filter.frequency.linearRampToValueAtTime(top, when + attack * 1.6);
		filter.frequency.setTargetAtTime(top * 0.72, when + attack * 1.6, 0.15);
		filter.frequency.setTargetAtTime(f * 1.2, end, release / 2);

		const body = ctx.createBiquadFilter();

		body.type = "peaking";
		body.frequency.value = spec.body;
		body.Q.value = 1.1;
		body.gain.value = 4;

		filter.connect(body).connect(amp).connect(this.bus(voice, spec.pan));

		const vibrato = ctx.createOscillator();

		vibrato.frequency.value = spec.vibrato.rate;

		const depth = ctx.createGain();

		depth.gain.setValueAtTime(0, when);

		if (duration > spec.vibrato.delay + 0.15) {
			depth.gain.setValueAtTime(0, when + spec.vibrato.delay);

			depth.gain.linearRampToValueAtTime(
				spec.vibrato.depth,
				Math.min(end, when + spec.vibrato.delay + 0.3),
			);
		}

		vibrato.connect(depth);

		const sources: AudioScheduledSourceNode[] = [vibrato];

		const target = sound.slide === null ? null : hz(sound.slide);

		for (const offset of [-spec.detune, spec.detune]) {
			const osc = ctx.createOscillator();

			if (spec.partials === "saw") osc.type = "sawtooth";
			else osc.setPeriodicWave(this.wave(voice, spec.partials));

			osc.frequency.setValueAtTime(f, when);

			if (target) {
				const glide = Math.min(0.4, duration * 0.6);
				const start = when + Math.min(0.08, duration * 0.2);

				osc.frequency.setValueAtTime(f, start);
				osc.frequency.exponentialRampToValueAtTime(target, start + glide);
			}

			osc.detune.setValueAtTime(offset + spec.scoop, when);
			osc.detune.linearRampToValueAtTime(offset, when + 0.06);
			depth.connect(osc.detune);
			osc.connect(filter);
			osc.start(when);
			osc.stop(end + release * 2);
			sources.push(osc);
		}

		vibrato.start(when);
		vibrato.stop(end + release * 2);

		let breath: GainNode | null = null;

		if (spec.breath > 0) {
			const air = ctx.createBufferSource();

			air.buffer = this.noise;
			air.loop = true;

			const band = ctx.createBiquadFilter();

			band.type = "bandpass";
			band.frequency.value = Math.min(8000, f * 3);
			band.Q.value = 1.4;
			breath = ctx.createGain();
			breath.gain.setValueAtTime(0, when);
			breath.gain.linearRampToValueAtTime(spec.breath * velocity, when + 0.02);

			breath.gain.setTargetAtTime(
				spec.breath * velocity * 0.4,
				when + 0.03,
				0.05,
			);

			breath.gain.setTargetAtTime(0, end, 0.03);
			air.connect(band).connect(breath).connect(this.bus(voice, spec.pan));
			air.start(when, Math.random() * 0.5);
			air.stop(end + 0.2);
			sources.push(air);
		}

		return (at = ctx.currentTime) => {
			const t = Math.max(at, when + 0.03);

			for (const param of [amp.gain, breath?.gain]) {
				if (!param) continue;

				param.cancelScheduledValues(t);
				param.setTargetAtTime(0, t, release / 3);
			}

			filter.frequency.cancelScheduledValues(t);
			filter.frequency.setTargetAtTime(f * 1.2, t, release / 2);

			for (const source of sources) source.stop(t + release * 3);
		};
	}

	warm(voice: keyof typeof strings, keys: number[]) {
		for (const key of keys) this.pluck(voice, key);
	}

	private string(voice: keyof typeof strings, sound: Sound) {
		const ctx = this.ctx;
		const spec = strings[voice];
		const stagger = voice === "banjo" ? 0.011 : 0.004;

		sound.keys.forEach((key, index) => {
			const when = sound.when + index * stagger;
			const detunes = spec.detune ? [-spec.detune, spec.detune] : [0];
			const amp = ctx.createGain();

			const level =
				(spec.level * sound.velocity) /
				Math.sqrt(detunes.length) /
				(sound.keys.length > 2 ? 1.3 : 1);

			amp.gain.setValueAtTime(level, when);

			const damp = when + Math.max(0.08, sound.duration);

			amp.gain.setTargetAtTime(0, damp, voice === "piano" ? 0.09 : 0.05);
			amp.connect(this.bus(voice, spec.pan));

			for (const cents of detunes) {
				const { buffer, rate } = this.pluck(voice, key);
				const source = ctx.createBufferSource();

				source.buffer = buffer;
				source.playbackRate.value = rate * 2 ** (cents / 1200);
				source.connect(amp);
				source.start(when);
				source.stop(damp + 0.6);
			}
		});
	}

	private pluck(voice: keyof typeof strings, key: number) {
		const spec = strings[voice];
		const rate = this.ctx.sampleRate;
		const f = hz(key);
		const period = Math.max(2, Math.floor(rate / f - 0.5));
		const actual = rate / (period + 0.5);
		const id = `${voice}:${key}`;
		let buffer = this.plucks.get(id);

		if (!buffer) {
			const t = Math.min(1, Math.max(0, (key - 36) / 48));
			const seconds = spec.seconds[0] + (spec.seconds[1] - spec.seconds[0]) * t;
			const decay = Math.exp(Math.log(0.001) / (seconds * actual));
			const length = Math.ceil(rate * seconds);
			const data = new Float32Array(length);
			const excite = new Float32Array(period + 1);
			let last = 0;

			for (let i = 0; i <= period; i++) {
				last = last * spec.soft + (Math.random() * 2 - 1) * (1 - spec.soft);
				excite[i] = last;
			}

			const pick = Math.max(1, Math.round(period * spec.pick));

			for (let i = 0; i <= period; i++)
				data[i] = excite[i] - (i >= pick ? excite[i - pick] : 0);

			for (let i = period + 1; i < length; i++)
				data[i] = decay * 0.5 * (data[i - period] + data[i - period - 1]);

			let peak = 0;

			for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));

			for (let i = 0; i < length; i++) data[i] /= peak || 1;

			buffer = this.ctx.createBuffer(1, length, rate);
			buffer.copyToChannel(data, 0);
			this.plucks.set(id, buffer);
		}

		return { buffer, rate: f / actual };
	}

	private whiteNoise(seconds: number) {
		const length = Math.ceil(this.ctx.sampleRate * seconds);
		const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
		const data = buffer.getChannelData(0);

		for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

		return buffer;
	}

	private room(seconds: number) {
		const rate = this.ctx.sampleRate;
		const length = Math.ceil(rate * seconds);
		const buffer = this.ctx.createBuffer(2, length, rate);

		for (let channel = 0; channel < 2; channel++) {
			const data = buffer.getChannelData(channel);
			let smooth = 0;

			for (let i = 0; i < length; i++) {
				const t = i / rate;

				smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4;
				data[i] = t < 0.012 ? 0 : smooth * Math.exp(-t * 4.2);
			}
		}

		return buffer;
	}
}
