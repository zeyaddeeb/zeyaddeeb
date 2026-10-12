import { span } from "./deck";
import { FILMED_AT, type FilmId, filmed, reel } from "./film";
import type { Cutter } from "./matte";

function projector(id: FilmId) {
	const video = document.createElement("video");

	video.muted = true;
	video.playsInline = true;
	video.preload = "auto";
	video.src = reel(id, "mp4");

	return video;
}

export class Footage {
	readonly frame = document.createElement("canvas");
	readonly shade = document.createElement("canvas");
	ready = false;
	private reels: [HTMLVideoElement, HTMLVideoElement];
	private live = 0;
	private still = new Image();
	private shown = -1;
	private gone = false;

	constructor(
		readonly id: FilmId,
		public now: number,
		public next: number,
	) {
		const [width, height] = filmed(id).size;

		for (const canvas of [this.frame, this.shade]) {
			canvas.width = width;
			canvas.height = height;
		}

		this.reels = [projector(id), projector(id)];
		this.cue(this.reels[0], now);
		this.cue(this.reels[1], next);
		this.still.onload = () => this.pose();
		this.still.src = reel(id, "png");
	}

	private get playing() {
		return this.reels[this.live];
	}

	private get spare() {
		return this.reels[1 - this.live];
	}

	private cue(video: HTMLVideoElement, move: number) {
		video.pause();
		video.currentTime = (span(this.id, move).first + 0.5) / FILMED_AT;
	}

	private pose() {
		if (this.gone || this.shown >= 0) return;

		const [x, y, side] = filmed(this.id).still;

		this.frame.getContext("2d")?.drawImage(this.still, x, y, side, side);
		this.darken();
		this.ready = true;
	}

	private darken() {
		const ctx = this.shade.getContext("2d");

		if (!ctx) return;

		ctx.globalCompositeOperation = "copy";
		ctx.drawImage(this.frame, 0, 0);
		ctx.globalCompositeOperation = "source-in";
		ctx.fillRect(0, 0, this.shade.width, this.shade.height);
	}

	get through() {
		const { first, length } = span(this.id, this.now);
		const frame = this.playing.currentTime * FILMED_AT;

		return Math.min(1, Math.max(0, (frame - first) / length));
	}

	get over() {
		const { first, length } = span(this.id, this.now);
		const frame = this.playing.currentTime * FILMED_AT;

		return this.playing.ended || frame >= first + length - 0.5;
	}

	run(speed: number) {
		const video = this.playing;

		if (Math.abs(video.playbackRate - speed) > 0.004)
			video.playbackRate = speed;

		if (video.paused && !this.over) void video.play().catch(() => {});
	}

	rest() {
		for (const video of this.reels) video.pause();
	}

	recue(move: number) {
		this.next = move;
		this.cue(this.spare, move);
	}

	turn(following: number) {
		const spare = this.spare;

		this.playing.pause();

		if (spare.seeking || spare.readyState < 2) return false;

		this.live = 1 - this.live;
		this.now = this.next;
		this.next = following;
		this.cue(this.spare, following);

		return true;
	}

	cut(cutter: Cutter) {
		const video = this.playing;

		if (video.readyState < 2 || video.seeking) return;

		if (video.currentTime === this.shown) return;

		if (!cutter.cut(video, this.frame)) return;

		this.darken();
		this.shown = video.currentTime;
		this.ready = true;
	}

	dispose() {
		this.gone = true;
		this.still.onload = null;

		for (const video of this.reels) {
			video.pause();
			video.removeAttribute("src");
			video.load();
		}
	}
}
