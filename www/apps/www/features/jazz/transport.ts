import {
	type CompiledScore,
	compileAll,
	laneIds,
	notes,
	type Score,
	type Voice,
} from "./score";
import type { Band } from "./synth";

const ahead = 0.14;

export interface Position {
	clock: number;
	bar: number;
	beat: number;
}

interface Pending {
	score: Score;
	compiled: CompiledScore;
	at: number;
}

export class Transport {
	private score: Score;
	private compiled: CompiledScore;
	private pending: Pending | null = null;
	private anchorTime = 0;
	private anchorClock = 0;
	private scheduled = 0;
	private timer: ReturnType<typeof setInterval> | null = null;

	constructor(
		readonly band: Band,
		readonly bars: number,
		score: Score,
	) {
		this.score = score;
		this.compiled = compileAll(score);
	}

	get playing() {
		return this.timer !== null;
	}

	private get perBar() {
		return 240 / this.score.tempo;
	}

	queue(
		score: Score,
		compiled = compileAll(score),
		land?: number,
	): number | null {
		if (!this.playing) {
			this.score = score;
			this.compiled = compiled;
			this.pending = null;

			return null;
		}

		const next = Math.max(0, Math.ceil(this.scheduled - 1e-9));

		const at =
			land === undefined
				? next
				: Math.max(land, Math.floor(this.scheduled + 1e-9));

		this.pending = { score, compiled, at };

		return at;
	}

	warm() {
		for (let bar = 0; bar < this.bars; bar++)
			for (const lane of ["piano", "banjo"] as const)
				for (const note of notes(this.compiled, lane, bar, 1))
					this.band.warm(lane, note.keys);
	}

	start(countIn = true) {
		this.stop();
		this.anchorClock = countIn ? -1 : 0;
		this.anchorTime = this.band.ctx.currentTime + 0.08;
		this.scheduled = this.anchorClock;
		this.tick();
		this.timer = setInterval(() => this.tick(), 25);
	}

	stop() {
		if (this.timer) clearInterval(this.timer);

		this.timer = null;

		if (this.pending) {
			this.score = this.pending.score;
			this.compiled = this.pending.compiled;
			this.pending = null;
		}
	}

	private clockAt(time: number) {
		return this.anchorClock + (time - this.anchorTime) / this.perBar;
	}

	private timeAt(clock: number) {
		return this.anchorTime + (clock - this.anchorClock) * this.perBar;
	}

	bar(clock: number) {
		return ((Math.floor(clock) % this.bars) + this.bars) % this.bars;
	}

	position(): Position | null {
		if (!this.playing) return null;

		const clock = this.clockAt(this.band.ctx.currentTime - this.band.latency);
		const whole = Math.floor(clock);

		return {
			clock,
			bar: clock < 0 ? -1 : this.bar(whole),
			beat: (clock - whole) * 4,
		};
	}

	private tick() {
		let end = this.clockAt(this.band.ctx.currentTime + ahead);
		let clock = Math.floor(this.scheduled);

		while (clock < end) {
			if (this.pending && clock >= this.pending.at) {
				this.anchorTime = this.timeAt(clock);
				this.anchorClock = clock;
				this.score = this.pending.score;
				this.compiled = this.pending.compiled;
				this.pending = null;
				end = this.clockAt(this.band.ctx.currentTime + ahead);

				if (clock >= end) break;
			}

			const from = Math.max(this.scheduled, clock);
			const to = Math.min(end, clock + 1);

			if (clock < 0) {
				for (let beat = 0; beat < 4; beat++) {
					const onset = clock + beat / 4;

					if (onset >= from && onset < to)
						this.band.clap(this.timeAt(onset), beat ? 0.55 : 0.8);
				}
			} else this.schedule(clock, from, to);

			this.scheduled = to;

			if (to < clock + 1) break;

			clock++;
		}
	}

	private schedule(clock: number, from: number, to: number) {
		const bar = this.bar(clock);

		for (const lane of laneIds) {
			if (lane === "chords" || this.score.muted.includes(lane)) continue;

			for (const note of notes(this.compiled, lane, bar, this.score.swing)) {
				const onset = note.onset - bar + clock;

				if (onset < from || onset >= to) continue;

				const offset = note.offset - bar + clock;
				const accent =
					Math.abs(note.onset * 4 - Math.round(note.onset * 4)) < 1e-6;

				this.band.play({
					voice: lane as Voice | "you",
					keys: note.keys,
					slide: note.slide,
					when: this.timeAt(onset) + (Math.random() - 0.5) * 0.008,
					duration: (offset - onset) * this.perBar * 0.94,
					velocity: (accent ? 1 : 0.86) * (0.94 + Math.random() * 0.08),
				});
			}
		}
	}
}
