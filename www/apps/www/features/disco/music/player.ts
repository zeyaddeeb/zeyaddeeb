import type { Note } from "./arrange";
import {
	advance,
	begin,
	between,
	clampRate,
	latest,
	position,
	retime,
	type Transport,
	timeAt,
	trim,
} from "./schedule";
import { score } from "./score";
import { Synth } from "./synth";
import { type TuneId, tune, tunes } from "./tunes";

const ahead = 0.12;
const hiddenAhead = 1.5;
const every = 25;
const countIn = 0.06;
const late = 0.01;
const memory = 1;

export interface Clock {
	playing: boolean;
	beat: number;
	bpm: number;
}

interface Rig {
	ctx: AudioContext;
	synth: Synth;
	analyser: AnalyserNode;
	volume: GainNode;
}

const latency = (ctx: AudioContext) =>
	ctx.outputLatency || ctx.baseLatency || 0;

function build(level: number): Rig {
	const ctx = new AudioContext({ latencyHint: "interactive" });
	const synth = new Synth(ctx);
	const analyser = ctx.createAnalyser();
	const volume = ctx.createGain();

	analyser.fftSize = 1024;
	analyser.smoothingTimeConstant = 0.75;
	volume.gain.value = level;
	synth.output.connect(analyser).connect(volume).connect(ctx.destination);

	return { ctx, synth, analyser, volume };
}

export class Player {
	private rig: Rig | null = null;
	private id: TuneId = tunes[0].id;
	private notes: Note[] = [];
	private transport: Transport | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private rate = 1;
	private level = 1;
	private turn = 0;
	private reported = 0;

	get analyser(): AnalyserNode | null {
		return this.rig?.analyser ?? null;
	}

	private get bpm() {
		return tune(this.id).bpm * this.rate;
	}

	async play(id: TuneId): Promise<void> {
		const turn = ++this.turn;
		const rig = this.rig ?? build(this.level);

		this.rig = rig;
		this.id = id;
		this.halt();

		if (rig.ctx.state !== "running") await rig.ctx.resume();

		if (turn !== this.turn) return;

		this.notes = score(id);
		this.reported = 0;
		this.transport = begin(rig.ctx.currentTime + countIn, this.bpm);
		this.tick();
		this.timer = setInterval(() => this.tick(), every);
	}

	stop(): void {
		this.turn++;
		this.halt();
	}

	setRate(rate: number): void {
		this.rate = clampRate(rate);

		if (this.transport) this.transport = retime(this.transport, this.bpm);
	}

	setVolume(volume: number): void {
		this.level = Math.min(1, Math.max(0, volume));

		if (!this.rig) return;

		const { ctx, volume: out } = this.rig;

		out.gain.setTargetAtTime(this.level, ctx.currentTime, 0.015);
	}

	clock(): Clock {
		if (!this.rig || !this.transport)
			return { playing: false, beat: 0, bpm: this.bpm };

		const heard = this.rig.ctx.currentTime - latency(this.rig.ctx);
		const { beat, bpm } = position(this.transport, heard);

		this.reported = Math.max(this.reported, beat);

		return { playing: true, beat: this.reported, bpm };
	}

	dispose(): void {
		this.stop();
		this.rig?.ctx.close();
		this.rig = null;
	}

	private halt() {
		if (this.timer) clearInterval(this.timer);

		this.timer = null;
		this.transport = null;
		this.rig?.synth.silence();
	}

	private tick() {
		const { rig, transport } = this;

		if (!rig || !transport) return;

		const now = rig.ctx.currentTime;
		const reach = now + (document.hidden ? hiddenAhead : ahead);
		const next = advance(transport, reach);
		const anchor = latest(transport);
		const loop = tune(this.id).beats;

		for (const hit of between(
			this.notes,
			loop,
			transport.scheduled,
			next.scheduled,
		)) {
			const when = timeAt(anchor, hit.beat);

			if (when < now - late) continue;

			rig.synth.play(hit.event, when, (hit.event.length * 60) / anchor.bpm);
		}

		this.transport = trim(next, now - latency(rig.ctx) - memory);
	}
}
