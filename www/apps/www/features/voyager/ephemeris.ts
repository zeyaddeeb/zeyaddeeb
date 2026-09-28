import { weekly, yearly } from "./ephemeris-data";

export const AU_KM = 149_597_870.7;
export const C_KM_S = 299_792.458;
export const DAY_S = 86_400;
export const LAUNCH = Date.UTC(1977, 8, 5, 12, 56, 0);

const start = Date.parse(`${weekly.start}T00:00:00Z`);
const stepMs = weekly.stepDays * DAY_S * 1000;
const auPerDay = (kmPerS: number) => (kmPerS * DAY_S) / AU_KM;

function hermite(
	values: number[],
	rates: number[],
	ms: number,
): [number, number] {
	const last = values.length - 1;
	const x = Math.min(Math.max((ms - start) / stepMs, 0), last);
	const i = Math.min(Math.floor(x), last - 1);
	const t = x - i;
	const h = weekly.stepDays;
	const p0 = values[i];
	const p1 = values[i + 1];
	const m0 = auPerDay(rates[i]) * h;
	const m1 = auPerDay(rates[i + 1]) * h;
	const t2 = t * t;
	const t3 = t2 * t;
	const value =
		(2 * t3 - 3 * t2 + 1) * p0 +
		(t3 - 2 * t2 + t) * m0 +
		(-2 * t3 + 3 * t2) * p1 +
		(t3 - t2) * m1;
	const slope =
		((6 * t2 - 6 * t) * p0 +
			(3 * t2 - 4 * t + 1) * m0 +
			(-6 * t2 + 6 * t) * p1 +
			(3 * t2 - 2 * t) * m1) /
		h;
	return [value, (slope * AU_KM) / DAY_S];
}

export interface Fix {
	km: number;
	kmPerS: number;
	lightSeconds: number;
	sunKm: number;
	sunKmPerS: number;
}

export function fix(ms: number): Fix {
	const [delta, deldot] = hermite(weekly.delta, weekly.deldot, ms);
	const [r, rdot] = hermite(weekly.r, weekly.rdot, ms);
	const km = delta * AU_KM;
	return {
		km,
		kmPerS: deldot,
		lightSeconds: km / C_KM_S,
		sunKm: r * AU_KM,
		sunKmPerS: rdot,
	};
}

export function lightDay(): number {
	const target = DAY_S * C_KM_S;
	const n = weekly.delta.length;
	for (let i = 0; i < n - 1; i++) {
		const a = start + i * stepMs;
		if (fix(a).km <= target && fix(a + stepMs).km > target) {
			let lo = a;
			let hi = a + stepMs;
			for (let k = 0; k < 40; k++) {
				const mid = (lo + hi) / 2;
				if (fix(mid).km < target) lo = mid;
				else hi = mid;
			}
			return Math.round(hi);
		}
	}
	return Number.NaN;
}

export function sunAt(year: number): number {
	const ms =
		Date.UTC(Math.floor(year), 0, 1) + (year % 1) * 365.25 * DAY_S * 1000;
	const points = yearly.map((y) => ({
		t: Date.parse(`${y.date}T00:00:00Z`),
		r: y.r,
	}));
	if (ms <= LAUNCH) return 1;
	if (ms < points[0].t) {
		const f = (ms - LAUNCH) / (points[0].t - LAUNCH);
		return 1 + (points[0].r - 1) * f;
	}
	for (let i = 0; i < points.length - 1; i++) {
		if (ms <= points[i + 1].t) {
			const f = (ms - points[i].t) / (points[i + 1].t - points[i].t);
			return points[i].r + (points[i + 1].r - points[i].r) * f;
		}
	}
	return points[points.length - 1].r;
}

export function duration(seconds: number) {
	const s = Math.max(0, Math.floor(seconds));
	return {
		h: Math.floor(s / 3600),
		m: Math.floor((s % 3600) / 60),
		s: s % 60,
	};
}

export const grouped = (n: number) => Math.round(n).toLocaleString("en-US");
