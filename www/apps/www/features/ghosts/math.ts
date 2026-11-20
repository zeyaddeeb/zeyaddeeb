export interface QuantizedSeries {
	scale: number;
	q: number[];
	extrema: {
		top: number[];
		bottom: number[];
	};
}

export interface CoinFeatures {
	alts: number;
	maxRun: number;
	imb: number;
	hFrac: number;
}

export function dequantize(series: QuantizedSeries): Float64Array {
	const out = new Float64Array(series.q.length);
	const k = series.scale / 32000;
	for (let i = 0; i < series.q.length; i++) {
		out[i] = (series.q[i] ?? 0) * k;
	}
	return out;
}

export function pearsonR(a: Float64Array, b: Float64Array): number {
	const n = Math.min(a.length, b.length);
	if (n < 2) return 0;
	let ma = 0;
	let mb = 0;
	for (let i = 0; i < n; i++) {
		ma += a[i] ?? 0;
		mb += b[i] ?? 0;
	}
	ma /= n;
	mb /= n;
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < n; i++) {
		const xa = (a[i] ?? 0) - ma;
		const xb = (b[i] ?? 0) - mb;
		num += xa * xb;
		da += xa * xa;
		db += xb * xb;
	}
	const den = Math.sqrt(da * db);
	return den < 1e-12 ? 0 : num / den;
}

export function developGhost(
	frames: Int8Array[],
	scores: Float64Array,
	n: number,
): {
	full: Float64Array;
	even: Float64Array;
	odd: Float64Array;
	splitR: number;
} {
	const count = Math.max(2, Math.min(n, frames.length, scores.length));
	const cells = frames[0]?.length ?? 0;
	let mean = 0;
	for (let i = 0; i < count; i++) mean += scores[i] ?? 0;
	mean /= count;
	let v = 0;
	for (let i = 0; i < count; i++) {
		const d = (scores[i] ?? 0) - mean;
		v += d * d;
	}
	const std = Math.sqrt(v / count);
	const invStd = std < 1e-12 ? 0 : 1 / std;

	const full = new Float64Array(cells);
	const even = new Float64Array(cells);
	const odd = new Float64Array(cells);
	let nEven = 0;
	let nOdd = 0;

	for (let i = 0; i < count; i++) {
		const z = ((scores[i] ?? 0) - mean) * invStd;
		const f = frames[i];
		if (!f) continue;
		const target = i % 2 === 0 ? even : odd;
		if (i % 2 === 0) nEven++;
		else nOdd++;
		for (let c = 0; c < cells; c++) {
			const val = z * (f[c] ?? 0);
			full[c] = (full[c] ?? 0) + val;
			target[c] = (target[c] ?? 0) + val;
		}
	}

	for (let c = 0; c < cells; c++) {
		full[c] = (full[c] ?? 0) / count;
		even[c] = nEven > 0 ? (even[c] ?? 0) / nEven : 0;
		odd[c] = nOdd > 0 ? (odd[c] ?? 0) / nOdd : 0;
	}

	return { full, even, odd, splitR: pearsonR(even, odd) };
}

export function coinFeatures(seq: readonly string[]): CoinFeatures {
	let altCount = 0;
	let maxRun = 1;
	let run = 1;
	let heads = seq[0] === "H" ? 1 : 0;
	for (let i = 1; i < seq.length; i++) {
		if (seq[i] === "H") heads++;
		if (seq[i] !== seq[i - 1]) {
			altCount++;
			run = 1;
		} else {
			run++;
			if (run > maxRun) maxRun = run;
		}
	}
	const hFrac = heads / Math.max(seq.length, 1);
	return {
		alts: altCount / Math.max(seq.length - 1, 1),
		maxRun,
		imb: Math.abs(2 * hFrac - 1),
		hFrac,
	};
}

export function findNgramEchoes(
	symbols: readonly string[],
	n = 3,
): (number | null)[] {
	const out: (number | null)[] = new Array(symbols.length).fill(null);
	const seen = new Map<string, number>();
	for (let t = n; t < symbols.length; t++) {
		const ctx = symbols.slice(t - n, t).join("|");
		const prev = seen.get(ctx);
		if (prev !== undefined) out[t] = prev;
		seen.set(ctx, t);
	}
	return out;
}

function normInv(p: number): number {
	const a = [
		-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269,
		-30.66479806614716, 2.506628277459239,
	];
	const b = [
		-54.47609879822406, 161.5858368580409, -155.6989798598866,
		66.80131188771972, -13.28068155288572,
	];
	const c = [
		-0.007784894002430293, -0.3223964580411365, -2.400758277161838,
		-2.549732539343734, 4.374664141464968, 2.938163982698783,
	];
	const d = [
		0.007784695709041462, 0.3224671290700398, 2.445134137142996,
		3.754408661907416,
	];
	const plow = 0.02425;
	const phigh = 1 - plow;
	if (p < plow) {
		const q = Math.sqrt(-2 * Math.log(p));
		return (
			(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
			((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
		);
	}
	if (p <= phigh) {
		const q = p - 0.5;
		const r = q * q;
		return (
			((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) *
				q) /
			(((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
		);
	}
	const q = Math.sqrt(-2 * Math.log(1 - p));
	return -(
		(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
		((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
	);
}

export function sdtStats(
	hits: number,
	nSignal: number,
	falseAlarms: number,
	nNoise: number,
): { hitRate: number; faRate: number; dPrime: number; criterion: number } {
	const hrAdj = (hits + 0.5) / (nSignal + 1);
	const farAdj = (falseAlarms + 0.5) / (nNoise + 1);
	const zh = normInv(hrAdj);
	const zfa = normInv(farAdj);
	return {
		hitRate: hits / Math.max(nSignal, 1),
		faRate: falseAlarms / Math.max(nNoise, 1),
		dPrime: zh - zfa,
		criterion: -0.5 * (zh + zfa),
	};
}
