import type { Swarm, Wheel } from "@zeyaddeeb/wasm";
import {
	ending,
	fixedSpin,
	type GapSample,
	type Observation,
	playback,
	regime,
	SIGMA,
	splash,
	steadyBeat,
} from "./model";

type Wasm = typeof import("@zeyaddeeb/wasm");

export const TRAIL = 4096;
export const COPY_TRAIL = 1024;
export const STREAK = 10;
const SAMPLES = 4;
const GAP_LIMIT = 90;

export class Ring {
	readonly data: Float32Array;
	head = 0;
	size = 0;

	constructor(readonly capacity: number) {
		this.data = new Float32Array(capacity * 3);
	}

	push(x: number, y: number, z: number) {
		const i = this.head * 3;
		this.data[i] = x;
		this.data[i + 1] = y;
		this.data[i + 2] = z;
		this.head = (this.head + 1) % this.capacity;
		this.size = Math.min(this.size + 1, this.capacity);
	}

	at(k: number) {
		return ((this.head - this.size + k + this.capacity) % this.capacity) * 3;
	}

	clear() {
		this.head = 0;
		this.size = 0;
	}
}

export type Crowd = "hundred" | "handful" | null;

export class Sim {
	readonly wheel: Wheel;
	readonly swarm: Swarm;
	copy: Wheel | null = null;
	rho: number;
	readonly trail = new Ring(TRAIL);
	readonly copyTrail = new Ring(COPY_TRAIL);
	crowd: Crowd = null;
	speed = 1;
	streaks: Float32Array[] = [];
	flips: number[] = [];
	clock = 0;
	seconds = 0;
	copyStart = 0;
	gaps: GapSample[] = [];
	private sign = 0;
	private readonly listeners = new Set<(dt: number) => void>();

	constructor(wasm: Wasm, rho: number) {
		this.rho = rho;
		this.wheel = new wasm.Wheel(SIGMA, rho);
		this.wheel.place(0, 0.01, 0);
		this.swarm = new wasm.Swarm(SIGMA, rho);
	}

	subscribe(fn: (dt: number) => void) {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	emit(dt = 0) {
		for (const fn of this.listeners) fn(dt);
	}

	warm(tau: number) {
		const pts = this.wheel.advance(tau, TRAIL);
		for (let i = 0; i < pts.length; i += 3) {
			this.trail.push(pts[i] ?? 0, pts[i + 1] ?? 0, pts[i + 2] ?? 0);
		}
		this.clock += tau;
		this.mark();
	}

	step(dt: number) {
		const tau = playback(this.rho) * dt * this.speed;
		const samples = SAMPLES * this.speed;
		const pts = this.wheel.advance(tau, samples);
		for (let i = 0; i < samples; i++) {
			const x = pts[i * 3] ?? 0;
			this.trail.push(x, pts[i * 3 + 1] ?? 0, pts[i * 3 + 2] ?? 0);
			const s = Math.sign(x);
			if (s !== 0 && this.sign !== 0 && s !== this.sign) {
				this.flips.push(this.clock + (tau * (i + 1)) / samples);
			}
			if (s !== 0) this.sign = s;
		}
		this.clock += tau;
		this.seconds += dt;
		if (this.copy) {
			const cp = this.copy.advance(tau, samples);
			for (let i = 0; i < cp.length; i += 3) {
				this.copyTrail.push(cp[i] ?? 0, cp[i + 1] ?? 0, cp[i + 2] ?? 0);
			}
			const t = this.seconds - this.copyStart;
			if (t <= GAP_LIMIT) this.gaps.push({ t, gap: this.gap() });
		}
		if (this.crowd) {
			this.streaks.push(this.swarm.advance(tau));
			if (this.streaks.length > STREAK) this.streaks.shift();
		}
		this.emit(dt);
	}

	crowdNow() {
		return this.streaks[this.streaks.length - 1] ?? null;
	}

	gap() {
		const c = this.copy;
		if (!c) return 0;
		const w = this.wheel;
		return Math.hypot(w.x() - c.x(), w.y() - c.y(), w.z() - c.z());
	}

	jump() {
		this.trail.push(Number.NaN, Number.NaN, Number.NaN);
		if (this.copy) this.copyTrail.push(Number.NaN, Number.NaN, Number.NaN);
		this.mark();
	}

	mark() {
		this.flips = [];
		this.sign = Math.sign(this.wheel.x());
	}

	setRho(rho: number) {
		const before = regime(this.rho);
		this.rho = rho;
		this.wheel.set_rho(rho);
		this.copy?.set_rho(rho);
		this.swarm.set_rho(rho);
		if (regime(rho) !== before) this.mark();
	}

	push(direction: 1 | -1) {
		const dx = direction * (1 + 0.5 * fixedSpin(this.rho));
		this.wheel.shove(dx);
		this.copy?.shove(dx);
		this.mark();
	}

	spinTo(x: number) {
		const limit = 3 * fixedSpin(Math.max(this.rho, 1)) + 6;
		const target = Math.max(-limit, Math.min(limit, x));
		const dx = target - this.wheel.x();
		this.wheel.shove(dx);
		this.copy?.shove(dx);
		this.mark();
	}

	pour(theta: number) {
		const { dy, dz } = splash(theta, this.rho);
		const w = this.wheel;
		w.place(w.x(), w.y() + dy, w.z() + dz);
		const c = this.copy;
		c?.place(c.x(), c.y() + dy, c.z() + dz);
		this.jump();
	}

	start(x: number, y: number, z: number) {
		this.dropCopy();
		this.wheel.place(x, y, z);
		this.jump();
	}

	restart() {
		this.start(0, 0.01, 0);
	}

	drop(
		crowd: Exclude<Crowd, null>,
		x: number,
		y: number,
		z: number,
		spread: number,
	) {
		this.swarm.scatter(x, y, z, spread, crowd === "hundred" ? 100 : 40);
		this.crowd = crowd;
		this.streaks = [this.swarm.advance(0)];
	}

	dropHundred() {
		const w = this.wheel;
		this.drop("hundred", w.x(), w.y(), w.z(), 0.15);
	}

	clearCrowd() {
		this.swarm.clear();
		this.crowd = null;
		this.streaks = [];
	}

	makeCopy() {
		this.copy?.free();
		this.copy = this.wheel.rounded(3);
		this.copyTrail.clear();
		this.copyStart = this.seconds;
		this.gaps = [{ t: 0, gap: this.gap() }];
	}

	dropCopy() {
		this.copy?.free();
		this.copy = null;
		this.copyTrail.clear();
		this.gaps = [];
	}

	observe(): Observation {
		const w = this.wheel;
		return {
			rho: this.rho,
			ending: ending(w.x(), w.y(), w.z(), this.rho),
			flips: this.flips.length,
			steady: steadyBeat(this.flips),
			moving: Math.abs(w.x()) > 0.05,
		};
	}

	free() {
		this.listeners.clear();
		this.copy?.free();
		this.swarm.free();
		this.wheel.free();
	}
}
