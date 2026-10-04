export type Vec = readonly [number, number, number];

export const SCALES = [1, 0.1, 0.01, 0.001] as const;
export const ZOOMS = ["×1", "×10", "×100", "×1000"] as const;
export const HEATER_MIN = 1.5;
export const HEATER_MAX = 10;
export const HEATER_START = 5;
export const MATCH_K = 8e-5;
export const QUIET_K = 2e-4;
export const MILKY_K = 5e-4;
export const ZERO_C = 273.15;
export const NYC_LONDON_KM = 5570;
export const FAR_COS = Math.cos((100 * Math.PI) / 180);
export const GALACTIC_CENTER: Vec = [1, 0, 0];

const MINUS = "−";

export function vec(lDeg: number, bDeg: number): Vec {
	const l = (lDeg * Math.PI) / 180;
	const b = (bDeg * Math.PI) / 180;

	return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}

export function angles(v: Vec): { l: number; b: number } {
	const len = Math.hypot(v[0], v[1], v[2]) || 1;
	const b = (Math.asin(v[2] / len) * 180) / Math.PI;
	const l = ((Math.atan2(v[1], v[0]) * 180) / Math.PI + 360) % 360;

	return { l, b };
}

export function opposite(v: Vec): Vec {
	return [-v[0], -v[1], -v[2]];
}

export function dot(a: Vec, b: Vec) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function zoomFor(gap: number, level: number) {
	let next = level;
	const size = Math.abs(gap);

	while (next < SCALES.length - 1 && size < 0.1 * SCALES[next]) next++;
	while (next > 0 && size > 1.2 * SCALES[next]) next--;

	return next;
}

export function kelvinPerTurn(level: number) {
	return SCALES[level];
}

export function clampHeater(t: number) {
	return Math.min(HEATER_MAX, Math.max(HEATER_MIN, t));
}

function decimals(level: number) {
	return level + 2;
}

function signed(n: number, places: number) {
	const text = Math.abs(n).toFixed(places);

	return n < 0 ? `${MINUS}${text}` : text;
}

export function kelvin(t: number, level: number) {
	return `${t.toFixed(decimals(level))} K`;
}

export function celsius(t: number, level: number) {
	return `${signed(t - ZERO_C, decimals(level))} °C`;
}

export function needleTurn(gap: number, level: number) {
	return Math.max(-1, Math.min(1, gap / SCALES[level]));
}

export function wobbleDegrees(beat: number) {
	return beat > 0 ? Math.min(14, 2.5 + beat * 1.5) : 0;
}

export interface Match {
	heater: number;
	lean: number;
	dir: Vec;
}

export interface Flow {
	first: Match | null;
	second: Match | null;
	other: boolean;
}

export const START_FLOW: Flow = { first: null, second: null, other: false };

export const MIN_LEAN_GAP = 0.6;

export function record(flow: Flow, match: Match): Flow {
	if (!flow.first) return { ...flow, first: match };

	return dot(match.dir, flow.first.dir) < FAR_COS
		? { ...flow, second: match }
		: { ...flow, first: match };
}

export function sideOn(flow: Flow) {
	return Boolean(
		flow.first &&
			flow.second &&
			Math.abs(flow.first.lean - flow.second.lean) < MIN_LEAN_GAP,
	);
}

export function speedOf(flow: Flow, speed: (a: Match, b: Match) => number) {
	if (!flow.first || !flow.second || sideOn(flow)) return null;

	const v = speed(flow.first, flow.second);

	return Number.isFinite(v) ? Math.abs(v) : null;
}

export function crossing(speedKms: number) {
	return NYC_LONDON_KM / speedKms;
}

export interface Reading {
	gap: number;
	leftover: number;
	heater: number;
	matched: boolean;
}

export function isMatched(gap: number, leftover: number) {
	return Math.abs(gap) < MATCH_K && leftover < QUIET_K;
}

export interface Caption {
	title: string;
	body: string;
}

export const OPENING: Caption = {
	title: "Match the sky.",
	body: "Turn the heater until the needle over the yellow ring goes still.",
};

export function describe(
	flow: Flow,
	now: Reading,
	speed: number | null,
): Caption {
	if (now.leftover > MILKY_K && Math.abs(now.gap) < 50 * MATCH_K) {
		return {
			title: "The Milky Way.",
			body: "It glows with warmth of its own. You can center the needle, but it never goes still.",
		};
	}

	if (speed !== null && flow.first && flow.second) {
		const colder = Math.abs(flow.first.heater - flow.second.heater);
		const time = Math.round(crossing(speed));

		return {
			title: `${Math.round(speed)} km/s.`,
			body: `One side of the sky is ${colder.toFixed(4)} degrees colder than the other. That isn’t the sky, it’s us, moving toward Crater, next to Leo. New York to London in ${time} seconds.`,
		};
	}

	if (sideOn(flow)) {
		return {
			title: "Side-on.",
			body: "These two spots sit side-on to the way we’re heading, so they read the same. Drag to Crater, match there, then point the other way.",
		};
	}

	if (flow.first && flow.other && !flow.second) {
		return {
			title: "Now the other side.",
			body: "Is it the same temperature? Match it again.",
		};
	}

	if (flow.first) {
		return {
			title: `${celsius(flow.first.heater, 0)}.`,
			body: `Just ${flow.first.heater.toFixed(2)} degrees above the coldest anything can be. It’s the glow left over from the Big Bang, and it looks the same everywhere. Does it?`,
		};
	}

	if (Math.abs(now.gap) < SCALES[2]) {
		return {
			title: "Close.",
			body: "The needle slows as the heater nears the sky. When it stops, they match.",
		};
	}

	return OPENING;
}
