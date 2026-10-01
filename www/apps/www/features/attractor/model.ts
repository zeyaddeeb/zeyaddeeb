import { clamp } from "../../lib/math";

export const SIGMA = 10;
export const HOPF = (SIGMA * (SIGMA + 4)) / (SIGMA - 2);
export const HOMOCLINIC = 8.18;
export const CHAOS = 14.9;
export const CLOCKS: [number, number][] = [
	[26.75, 27.75],
	[40, 41.5],
	[326, 350],
];
export const NEAR_MAX = 45;
export const FAR_MIN = 316;
export const FAR_MAX = 350;
export const NEAR_WIDTH = 0.84;
export const FAR_START = 0.86;
export const START_RHO = 28;
export const CUPS = 12;

export type Regime = "rest" | "turns" | "tangled" | "chaos" | "clock";

export function rhoAt(u: number) {
	const v = clamp(u, 0, 1);

	if (v <= NEAR_WIDTH) return NEAR_MAX * (v / NEAR_WIDTH) ** 2;

	if (v < FAR_START) return v - NEAR_WIDTH < FAR_START - v ? NEAR_MAX : FAR_MIN;

	return FAR_MIN + ((v - FAR_START) / (1 - FAR_START)) * (FAR_MAX - FAR_MIN);
}

export function uAt(rho: number) {
	if (rho <= NEAR_MAX)
		return NEAR_WIDTH * Math.sqrt(Math.max(rho, 0) / NEAR_MAX);

	if (rho < FAR_MIN) return NEAR_WIDTH;

	return (
		FAR_START +
		((Math.min(rho, FAR_MAX) - FAR_MIN) / (FAR_MAX - FAR_MIN)) * (1 - FAR_START)
	);
}

export function regime(rho: number): Regime {
	if (rho <= 1) return "rest";

	if (rho < HOMOCLINIC) return "turns";

	if (rho < CHAOS) return "tangled";

	if (CLOCKS.some(([a, b]) => rho >= a && rho <= b)) return "clock";

	return "chaos";
}

export const regions: {
	regime: Regime;
	label: string;
	from: number;
	to: number;
	preset: number;
	says: string;
}[] = [
	{
		regime: "rest",
		label: "Rests",
		from: 0,
		to: 1,
		preset: 0.6,
		says: "too little water to tip it",
	},
	{
		regime: "turns",
		label: "Turns",
		from: 1,
		to: HOMOCLINIC,
		preset: 5,
		says: "it turns one way and keeps going",
	},
	{
		regime: "tangled",
		label: "Tangled",
		from: HOMOCLINIC,
		to: CHAOS,
		preset: 12,
		says: "it reverses a few times, then settles",
	},
	{
		regime: "chaos",
		label: "Chaos",
		from: CHAOS,
		to: NEAR_MAX,
		preset: 28,
		says: "it never settles",
	},
	{
		regime: "clock",
		label: "Clock",
		from: FAR_MIN,
		to: FAR_MAX,
		preset: 340,
		says: "it rocks back and forth on a steady beat",
	},
];

export const playback = (rho: number) =>
	clamp(3.2 / Math.sqrt(Math.max(rho, 1)), 0.16, 1.4);

const BASE = 1.1;
const SPLASH = 0.55;

export const waterLevel = (rho: number) => clamp((rho + 0.3) / 6, 0, 1);

export function modes(y: number, z: number, rho: number) {
	const r = Math.max(rho, 0.05);

	return { a: y / r, b: 1 - z / r };
}

export function fill(theta: number, y: number, z: number, rho: number) {
	const { a, b } = modes(y, z, rho);
	const m = (BASE + a * Math.sin(theta) + b * Math.cos(theta)) / (2 * BASE);

	return clamp(m, 0, 1) * waterLevel(rho);
}

export function weight(y: number, z: number, rho: number) {
	const { a, b } = modes(y, z, rho);

	return { right: a / (2 * BASE), up: b / (2 * BASE) };
}

export const fixedSpin = (rho: number) => Math.sqrt(Math.max(rho - 1, 0));

export function splash(theta: number, rho: number) {
	const r = Math.max(rho, 0.05);

	return {
		dy: r * SPLASH * Math.sin(theta),
		dz: -r * SPLASH * Math.cos(theta),
	};
}

export type Ending = "clockwise" | "anticlockwise" | "rest" | null;

export function settleRadius(rho: number) {
	const margin = Math.sqrt(Math.max(1 - rho / HOPF, 0));

	return Math.max(0.5 * margin, 0.02) * fixedSpin(rho);
}

export function ending(x: number, y: number, z: number, rho: number): Ending {
	if (rho <= 1) {
		return Math.abs(x) < 0.05 && Math.abs(y) < 0.05 && Math.abs(z) < 0.05
			? "rest"
			: null;
	}

	if (rho >= HOPF) return null;

	const c = fixedSpin(rho);
	const near = settleRadius(rho);
	const dz = z - (rho - 1);

	if (Math.hypot(x - c, y - c, dz) < near) return "clockwise";

	if (Math.hypot(x + c, y + c, dz) < near) return "anticlockwise";

	return null;
}

export function steadyBeat(flips: number[]) {
	if (flips.length < 7) return false;

	const recent = flips.slice(-7);
	const gaps = recent.slice(1).map((t, i) => t - (recent[i] ?? 0));
	const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;

	const spread = Math.sqrt(
		gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length,
	);

	return spread / mean < 0.04;
}

export interface Observation {
	rho: number;
	ending: Ending;
	flips: number;
	steady: boolean;
	moving: boolean;
}

const times = (n: number) =>
	n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;

export function describe({
	rho,
	ending: end,
	flips,
	steady,
	moving,
}: Observation) {
	const kind = regime(rho);

	if (kind === "rest") {
		return end === "rest" || !moving
			? "Resting. The cups leak as fast as the tap fills them, so the top never gets heavy enough to tip the wheel over."
			: "Slowing to a stop. With this little water, every start ends at rest.";
	}

	if (end === "clockwise" || end === "anticlockwise") {
		if (kind === "chaos" || kind === "clock") {
			return `Turning ${end}, steadily for now. At this much water a hard push can knock it into tumbling for good.`;
		}

		if (flips > 0) {
			return `It changed direction ${times(flips)}, then settled into turning ${end}. A slightly different start can end the other way.`;
		}

		return `Turning ${end} at a steady speed. It keeps going the way it first tipped.`;
	}

	if (kind === "turns") {
		return "Tipping over. Which way it ends up turning depends on which way it starts to fall.";
	}

	if (kind === "tangled") {
		return flips > 0
			? `Sloshing back and forth: ${times(flips)} so far. It will settle, but which way is hard to guess.`
			: "Tipping over. At this much water it may reverse a few times before it settles.";
	}

	if (steady) {
		return "Rocking back and forth on a steady beat, like a pendulum clock. Every swing repeats the last one.";
	}

	if (kind === "clock") {
		return "Tumbling for now, but at this much water it falls into a rhythm.";
	}

	return flips > 0
		? `Tumbling. It has changed direction ${times(flips)}, and it never falls into a pattern.`
		: "Tumbling. Watch for the moment it changes direction.";
}

export interface GapSample {
	t: number;
	gap: number;
}

export function growth(samples: GapSample[], ceiling: number) {
	const first = samples[0];

	if (!first) return null;

	const floor = first.gap * 10;
	const top = ceiling * 0.1;
	const used = samples.filter((s) => s.gap > floor && s.gap < top);

	if (used.length < 12) return null;

	const n = used.length;
	let st = 0;
	let sg = 0;
	let stt = 0;
	let stg = 0;

	for (const s of used) {
		const g = Math.log10(s.gap);

		st += s.t;
		sg += g;
		stt += s.t * s.t;
		stg += s.t * g;
	}

	const slope = (n * stg - st * sg) / (n * stt - st * st);

	if (!Number.isFinite(slope) || slope <= 0) return null;

	return 1 / slope;
}

export function printout(v: number, places: number) {
	const s = v.toFixed(places);

	return s.startsWith("-") ? `−${s.slice(1)}` : s;
}

export const ceilingFor = (rho: number) => Math.max(rho, 2) * 0.8;

export const within = (places: number) =>
	places <= 0 ? "1" : `0.${"0".repeat(places - 1)}1`;

export function agreement(gap: number) {
	if (gap <= 0) return 6;

	return clamp(Math.floor(-Math.log10(gap)), 0, 6);
}

export function verdict(gaps: GapSample[], rho: number) {
	const first = gaps[0];
	const last = gaps[gaps.length - 1];

	if (!first || !last) return "";

	const ceiling = ceilingFor(rho);
	const every = growth(gaps, ceiling);

	const pace = every
		? `One more decimal place went wrong about every ${every.toFixed(1)} s.`
		: "";

	if (last.gap > ceiling * 0.3) {
		return `They have nothing in common now. ${pace}`.trim();
	}

	if (last.t > 4 && last.gap < first.gap * 0.3) {
		return "The copy is catching up. With this much water, small differences die away instead of growing.";
	}

	const places = agreement(last.gap);

	const now =
		places > 0
			? `They still differ by less than ${within(places)}.`
			: "They no longer agree even on the whole numbers.";

	if (every) {
		return `${now} One more decimal place goes wrong about every ${every.toFixed(1)} s.`;
	}

	if (last.t > 15 && last.gap < first.gap * 10) {
		return `${now} At this much water, small differences stay small.`;
	}

	return now;
}

export function split(wheel: string, copy: string) {
	let i = 0;

	while (i < copy.length && copy[i] === wheel[i]) i++;

	return { same: copy.slice(0, i), different: copy.slice(i) };
}

export interface Tally {
	total: number;
	clockwise: number;
	anticlockwise: number;
	settledClockwise: number;
	settledAnticlockwise: number;
	resting: number;
	together: boolean;
}

export function tally(points: Float32Array, rho: number): Tally {
	const t: Tally = {
		total: 0,
		clockwise: 0,
		anticlockwise: 0,
		settledClockwise: 0,
		settledAnticlockwise: 0,
		resting: 0,
		together: true,
	};

	let lo = Number.POSITIVE_INFINITY;
	let hi = Number.NEGATIVE_INFINITY;

	for (let i = 0; i + 2 < points.length; i += 3) {
		const x = points[i] ?? 0;
		const end = ending(x, points[i + 1] ?? 0, points[i + 2] ?? 0, rho);

		t.total++;

		if (end === "rest") t.resting++;
		else if (end === "clockwise") t.settledClockwise++;
		else if (end === "anticlockwise") t.settledAnticlockwise++;

		if (x >= 0) t.clockwise++;
		else t.anticlockwise++;

		lo = Math.min(lo, x);
		hi = Math.max(hi, x);
	}

	t.together = hi - lo < 0.06 * (1 + fixedSpin(rho));

	return t;
}

export function tallyText(t: Tally, rho: number) {
	if (!t.total) return "";

	const all = t.total === 100 ? "All 100" : `All ${t.total}`;

	if (t.resting === t.total) return `${all} came to rest.`;

	const settled = t.settledClockwise + t.settledAnticlockwise;

	if (settled === t.total) {
		if (t.settledClockwise === t.total)
			return `${all} ended up turning clockwise.`;

		if (t.settledAnticlockwise === t.total)
			return `${all} ended up turning anticlockwise.`;

		return `They split: ${t.settledClockwise} ended up turning clockwise, ${t.settledAnticlockwise} anticlockwise.`;
	}

	if (t.together) return "Still moving together, as if they were one wheel.";

	if (settled > 0) {
		return `${settled} have settled so far. The rest are still sloshing: ${t.clockwise} turning clockwise right now, ${t.anticlockwise} anticlockwise.`;
	}

	if (regime(rho) === "clock") {
		return "They have come apart, but all fall into the same back-and-forth beat, each at its own point in the swing.";
	}

	const never =
		rho >= HOPF
			? "At this much water none of them will ever settle."
			: "None has settled yet.";

	return `They have come apart: ${t.clockwise} turning clockwise right now, ${t.anticlockwise} anticlockwise. ${never}`;
}
