import { deal, joins, opening, remember, span } from "./deck";
import { FILMED_AT, type FilmId, filmed, range, STANDS } from "./film";
import { Footage } from "./footage";
import {
	type Beat,
	fitted,
	type Hold,
	locked,
	START,
	STRAINED,
	steer,
} from "./lock";
import { Cutter } from "./matte";

const KEPT = 72;
const PATIENCE = 2.5;
const SHADE = 0.24;
const LEAN = 0.5;
const FLAT = 0.16;

export interface Dancer {
	id: FilmId;
	footage: Footage;
	hold: Hold;
	base: number;
	count: number;
	strained: number;
	dealt: number[];
	queue: number[];
	marks: number[];
}

export interface Reading {
	id: FilmId;
	move: number;
	next: number;
	queue: number[];
	speed: number;
	late: number;
	locked: boolean;
	strained: boolean;
}

export interface Spot {
	x: number;
	y: number;
}

export type Spots = Partial<Record<FilmId, Spot>>;

export interface Room {
	width: number;
	height: number;
	ground: number;
	zoom: number;
	spots: Spots;
}

function enter(id: FilmId): Dancer {
	const first = opening(id);
	const next = deal(id, first, [], Math.random);

	return {
		id,
		footage: new Footage(id, first, next),
		hold: START,
		base: 0,
		count: 0,
		strained: 0,
		dealt: [next],
		queue: [],
		marks: [],
	};
}

const keep = (marks: number[], at: number) => {
	marks.push(at);

	if (marks.length > KEPT) marks.shift();
};

export function homes(count: number) {
	if (count <= 1) return [0.6];

	if (count === 2) return [0.42, 0.76];

	return [0.3, 0.56, 0.82];
}

const reach = (room: Room) =>
	Math.min(room.height * 0.235, room.width * 0.3) * room.zoom;

const milliseconds = (hold: Hold, music: Beat) =>
	(hold.error / (music.bpm / 60)) * 1000;

const lasts = (id: FilmId, move: number) => span(id, move).length / FILMED_AT;

function reachable(id: FilmId, move: number, bpm: number) {
	const natural = (lasts(id, move) * bpm) / 60;
	const speed = natural / Math.max(1, Math.round(natural));
	const [slowest, fastest] = range(id);

	return speed >= slowest && speed <= fastest;
}

export class Floor {
	dancers: Dancer[] = [];
	music: number[] = [];
	bars: number[] = [];
	turned = false;
	private beat: Beat = { playing: false, beat: 0, bpm: 120 };
	private cutter: Cutter | null = null;
	private counted = 0;
	private last = 0;

	cast(ids: FilmId[]) {
		const before = this.dancers;

		this.dancers = ids.map(
			(id) => before.find((dancer) => dancer.id === id) ?? enter(id),
		);

		for (const dancer of before)
			if (!this.dancers.includes(dancer)) dancer.footage.dispose();

		this.turned = true;
	}

	rest() {
		for (const dancer of this.dancers) dancer.footage.rest();
	}

	ask(id: FilmId, move: number) {
		const dancer = this.dancers.find((entry) => entry.id === id);

		if (!dancer) return;

		const { footage, queue } = dancer;

		if (!queue.length && joins(id, footage.now, move)) footage.recue(move);
		else if (joins(id, queue.at(-1) ?? footage.next, move)) queue.push(move);

		this.turned = true;
	}

	step(now: number, beat: Beat) {
		const seconds = Math.min(0.1, Math.max(0, now - this.last));
		const whole = Math.floor(beat.beat);

		this.last = now;
		this.beat = beat;

		if (beat.playing && whole !== this.counted)
			keep(whole % 4 ? this.music : this.bars, now);

		this.counted = whole;
		this.cutter ??= new Cutter();

		for (const dancer of this.dancers) {
			this.roll(dancer, seconds);

			if (dancer.footage.over) this.deal(dancer, now);

			dancer.footage.cut(this.cutter);
		}
	}

	private roll(dancer: Dancer, seconds: number) {
		const { id, footage } = dancer;

		dancer.count = fitted(
			lasts(id, footage.now),
			this.beat.bpm,
			dancer.count,
			range(id),
		);
		dancer.hold = steer(
			dancer.hold,
			{
				at: dancer.base + footage.through * dancer.count,
				perBeat: span(id, footage.now).length / dancer.count,
				reach: range(id),
			},
			this.beat,
			seconds,
			FILMED_AT,
		);
		dancer.strained =
			this.beat.playing && dancer.hold.short > STRAINED
				? dancer.strained + seconds
				: 0;
		footage.run(dancer.hold.speed);
	}

	private pick(dancer: Dancer) {
		const { id, footage } = dancer;
		const fits = (move: number) =>
			!this.beat.playing || reachable(id, move, this.beat.bpm);

		return (
			dancer.queue[0] ?? deal(id, footage.next, dancer.dealt, Math.random, fits)
		);
	}

	private deal(dancer: Dancer, now: number) {
		const following = this.pick(dancer);

		if (!dancer.footage.turn(following)) return;

		dancer.queue.shift();
		dancer.base += dancer.count;
		dancer.count = 0;
		dancer.dealt = remember(dancer.id, dancer.dealt, following);
		keep(dancer.marks, now);
		this.turned = true;
	}

	read(): Reading[] {
		return this.dancers.map(({ id, footage, hold, queue, strained }) => ({
			id,
			move: footage.now,
			next: footage.next,
			queue: [...queue],
			speed: hold.speed,
			late: this.beat.playing ? milliseconds(hold, this.beat) : 0,
			locked: locked(hold, this.beat),
			strained: strained > PATIENCE,
		}));
	}

	paint(ctx: CanvasRenderingContext2D, room: Room) {
		const scale = reach(room);
		const spots = homes(this.dancers.length);
		const placed = this.dancers
			.filter((dancer) => dancer.footage.ready)
			.map((dancer) => {
				const spot = room.spots[dancer.id];
				const size = (scale * STANDS) / filmed(dancer.id).stature;

				return {
					footage: dancer.footage,
					x: spots[this.dancers.indexOf(dancer)] * room.width + (spot?.x ?? 0),
					ground: room.ground + (spot?.y ?? 0),
					wide: dancer.footage.frame.width * size,
					tall: dancer.footage.frame.height * size,
				};
			});

		ctx.clearRect(0, 0, room.width, room.height);
		ctx.imageSmoothingQuality = "high";

		for (const { footage, x, ground, wide, tall } of placed) {
			ctx.save();
			ctx.globalAlpha = SHADE;
			ctx.transform(1, 0, LEAN, -FLAT, x, ground);
			ctx.drawImage(footage.shade, -wide / 2, -tall, wide, tall);
			ctx.restore();
		}

		for (const { footage, x, ground, wide, tall } of placed)
			ctx.drawImage(footage.frame, x - wide / 2, ground - tall, wide, tall);
	}
}
