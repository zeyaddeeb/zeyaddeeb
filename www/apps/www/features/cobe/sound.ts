const BASE_HZ = 196;
const LEVEL = 0.05;

export class Beats {
	private readonly ctx: AudioContext;
	private readonly a: OscillatorNode;
	private readonly b: OscillatorNode;
	private readonly gain: GainNode;

	constructor() {
		this.ctx = new AudioContext();
		this.gain = this.ctx.createGain();
		this.gain.gain.value = 0;

		const filter = this.ctx.createBiquadFilter();

		filter.type = "lowpass";
		filter.frequency.value = 900;
		filter.connect(this.ctx.destination);
		this.gain.connect(filter);
		this.a = this.ctx.createOscillator();
		this.b = this.ctx.createOscillator();
		this.a.type = "sine";
		this.b.type = "sine";
		this.a.frequency.value = BASE_HZ;
		this.b.frequency.value = BASE_HZ;
		this.a.connect(this.gain);
		this.b.connect(this.gain);
		this.a.start();
		this.b.start();
	}

	set(beatHz: number) {
		const now = this.ctx.currentTime;
		const loud = beatHz > 0 ? LEVEL * Math.min(1, 0.35 + beatHz / 4) : 0;

		this.b.frequency.setTargetAtTime(BASE_HZ + beatHz, now, 0.05);
		this.gain.gain.setTargetAtTime(loud, now, beatHz > 0 ? 0.08 : 0.4);
	}

	async resume() {
		if (this.ctx.state === "suspended") await this.ctx.resume();
	}

	close() {
		const now = this.ctx.currentTime;

		this.gain.gain.setTargetAtTime(0, now, 0.05);
		window.setTimeout(() => {
			this.a.stop();
			this.b.stop();
			void this.ctx.close();
		}, 300);
	}
}
