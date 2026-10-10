export const RATE = 24_000;

const LEAD_SECONDS = 0.12;
const FULL_SCALE = 32_767;

export function pack(chunks: Float32Array[]) {
	const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const packed = new Int16Array(new ArrayBuffer(length * 2));
	let at = 0;

	for (const chunk of chunks)
		for (const sample of chunk)
			packed[at++] = Math.round(Math.max(-1, Math.min(1, sample)) * FULL_SCALE);

	return packed;
}

export function unpack(bytes: ArrayBuffer): Float32Array {
	const packed = new Int16Array(bytes, 0, Math.floor(bytes.byteLength / 2));
	const samples = new Float32Array(packed.length);

	for (let i = 0; i < packed.length; i++) samples[i] = packed[i] / FULL_SCALE;

	return samples;
}

export function schedule(now: number, due: number, seconds: number) {
	const at = due < now ? now + LEAD_SECONDS : due;

	return { at, due: at + seconds };
}

function context() {
	try {
		return new AudioContext({ sampleRate: RATE });
	} catch {
		return new AudioContext();
	}
}

export class Speaker {
	private readonly audio = context();
	private readonly volume = this.audio.createGain();
	private readonly sounding = new Set<AudioBufferSourceNode>();
	private due = 0;
	private held = false;

	constructor() {
		this.volume.connect(this.audio.destination);
	}

	play(bytes: ArrayBuffer) {
		const samples = unpack(bytes);

		if (this.held || !samples.length) return;

		const buffer = this.audio.createBuffer(1, samples.length, RATE);
		const node = this.audio.createBufferSource();
		const { at, due } = schedule(
			this.audio.currentTime,
			this.due,
			buffer.duration,
		);

		buffer.getChannelData(0).set(samples);
		node.buffer = buffer;
		node.connect(this.volume);
		node.onended = () => this.sounding.delete(node);
		node.start(at);

		this.sounding.add(node);
		this.due = due;
		this.audio.resume();
	}

	stop() {
		for (const node of this.sounding) node.stop();

		this.sounding.clear();
		this.due = 0;
		this.held = true;
	}

	resume() {
		this.held = false;
	}

	quiet(muted: boolean) {
		this.volume.gain.value = muted ? 0 : 1;
	}

	close() {
		this.stop();
		this.audio.close();
	}
}
