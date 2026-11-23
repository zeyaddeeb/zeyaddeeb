import raw from "./study.json";

export interface Packed {
	scale: number;
	data: string;
}

export interface FeatureCorrs {
	switches: number;
	firstH: number;
	hFrac: number;
	imbalance: number;
	maxRun: number;
	lastH: number;
}

export interface CheckpointFeatures {
	says: FeatureCorrs;
	twin: FeatureCorrs;
	expects: FeatureCorrs;
}

export interface WordingFraming {
	raw: Record<string, Record<string, number>>;
	partialHt: Record<string, Record<string, number>>;
}

export interface Checkpoint {
	label: string;
	stage: string;
	usable: number;
	agree: number[];
	partial: number;
	partialFirstH: number;
	partialHt: number[];
	partialShape: number;
	partialHtTwin: number;
	statedTwinHt: number;
	twinExpectsHt: number;
	features: CheckpointFeatures;
	wordingFraming?: WordingFraming;
	template: number;
	implicitTemplate: number;
	twinTemplate: number;
	statedTwin: number;
	twinExpects: number;
	altFair: number;
	altLog: number;
	mass: number;
	curve: number[];
	curveLogit: number[];
	upturn: number;
	says: Packed;
	expects: Packed;
	twin: Packed;
	saysRigged: number;
	expectsRigged: number;
}

export interface Family {
	id: string;
	label: string;
	path: string[];
}

export interface Pair {
	label: string;
	base: string;
	post: string;
	diff: number;
	lo: number;
	hi: number;
	partial: number;
	partialLo: number;
	partialHi: number;
	firstH: number;
	firstHLo: number;
	firstHHi: number;
	ht: number;
	htLo: number;
	htHi: number;
	htTwin: number;
	htTwinLo: number;
	htTwinHi: number;
}

export interface Pilot {
	face: number[];
	zorp: number[];
	cross: number[];
	null: number;
	grids: number;
}

export interface Study {
	protocol: string;
	seed: number;
	sealed: string;
	coins: string;
	families: Family[];
	checkpoints: Record<string, Checkpoint>;
	pairs: Pair[];
	pilot: Pilot;
	verdicts: Record<string, boolean>;
	followups?: Record<string, unknown>;
}

export const STUDY: Study = raw;
export const FLIPS = 16;
export const LIMIT = 3;

export type Flip = "H" | "T";

export interface Coin {
	index: number;
	flips: Flip[];
	switches: number;
	firstH: number;
	hFrac: number;
}

export interface Readings {
	says: Float32Array;
	expects: Float32Array;
	twin: Float32Array;
	saysHt: Float32Array;
	expectsHt: Float32Array;
	twinHt: Float32Array;
	saysRank: Uint8Array;
	expectsRank: Uint8Array;
	twinRank: Uint8Array;
	saysHtRank: Uint8Array;
	expectsHtRank: Uint8Array;
	twinHtRank: Uint8Array;
}

export function decode(packed: Packed): Float32Array {
	const bytes = atob(packed.data);
	const out = new Float32Array(bytes.length);

	for (let i = 0; i < bytes.length; i++) {
		const b = bytes.charCodeAt(i);
		out[i] = (b > 127 ? b - 256 : b) * packed.scale;
	}

	return out;
}

export function coinsOf(hex: string): Coin[] {
	const coins: Coin[] = [];

	for (let i = 0; i * 4 < hex.length; i++) {
		const bits = Number.parseInt(hex.slice(i * 4, i * 4 + 4), 16);
		const flips: Flip[] = [];

		for (let j = FLIPS - 1; j >= 0; j--)
			flips.push((bits >> j) & 1 ? "H" : "T");

		let switches = 0;
		let heads = flips[0] === "H" ? 1 : 0;
		for (let j = 1; j < FLIPS; j++) {
			if (flips[j] !== flips[j - 1]) switches++;
			if (flips[j] === "H") heads++;
		}

		coins.push({
			index: i,
			flips,
			switches,
			firstH: flips[0] === "H" ? 1 : 0,
			hFrac: heads / FLIPS,
		});
	}

	return coins;
}

export function residualizeHT(
	values: Float32Array,
	coins: readonly Coin[],
): Float32Array {
	const n = values.length;
	if (n < 4) return new Float32Array(values);

	let s1 = 0;
	let s2 = 0;
	let s11 = 0;
	let s12 = 0;
	let s22 = 0;
	let sy = 0;
	let s1y = 0;
	let s2y = 0;

	for (let i = 0; i < n; i++) {
		const x1 = coins[i]?.firstH ?? 0;
		const x2 = coins[i]?.hFrac ?? 0.5;
		const y = values[i] ?? 0;
		s1 += x1;
		s2 += x2;
		s11 += x1 * x1;
		s12 += x1 * x2;
		s22 += x2 * x2;
		sy += y;
		s1y += x1 * y;
		s2y += x2 * y;
	}

	const m = [
		[n, s1, s2, sy],
		[s1, s11, s12, s1y],
		[s2, s12, s22, s2y],
	];

	for (let col = 0; col < 3; col++) {
		let piv = col;
		for (let r = col + 1; r < 3; r++) {
			if (Math.abs(m[r]?.[col] ?? 0) > Math.abs(m[piv]?.[col] ?? 0)) piv = r;
		}
		if (piv !== col) {
			const tmp = m[col] as number[];
			m[col] = m[piv] as number[];
			m[piv] = tmp;
		}
		const diag = m[col]?.[col] ?? 1;
		if (Math.abs(diag) < 1e-12) continue;
		for (let r = 0; r < 3; r++) {
			if (r === col) continue;
			const row = m[r] as number[];
			const pRow = m[col] as number[];
			const factor = (row[col] ?? 0) / diag;
			for (let c = col; c < 4; c++) {
				row[c] = (row[c] ?? 0) - factor * (pRow[c] ?? 0);
			}
		}
	}

	const b0 = (m[0]?.[3] ?? 0) / (m[0]?.[0] || 1);
	const b1 = (m[1]?.[3] ?? 0) / (m[1]?.[1] || 1);
	const b2 = (m[2]?.[3] ?? 0) / (m[2]?.[2] || 1);

	const raw = new Float64Array(n);
	let sumSq = 0;
	for (let i = 0; i < n; i++) {
		const res =
			(values[i] ?? 0) -
			(b0 + b1 * (coins[i]?.firstH ?? 0) + b2 * (coins[i]?.hFrac ?? 0.5));
		raw[i] = res;
		sumSq += res * res;
	}

	const sd = Math.sqrt(sumSq / n);
	const out = new Float32Array(n);
	if (sd < 1e-12) return out;
	for (let i = 0; i < n; i++) out[i] = (raw[i] ?? 0) / sd;

	return out;
}

export function ranks(values: Float32Array): Uint8Array {
	const n = values.length;
	const order = Array.from({ length: n }, (_, i) => i).sort(
		(a, b) => (values[a] ?? 0) - (values[b] ?? 0),
	);
	const out = new Uint8Array(n);
	let start = 0;

	while (start < n) {
		let end = start;
		const v = values[order[start] ?? 0];
		while (end + 1 < n && values[order[end + 1] ?? 0] === v) end++;

		const below = (start + end) / 2;
		const pct = n > 1 ? Math.round((100 * below) / (n - 1)) : 50;
		for (let i = start; i <= end; i++) out[order[i] ?? 0] = pct;

		start = end + 1;
	}

	return out;
}

export const COINS = coinsOf(STUDY.coins);

const cache = new Map<string, Readings>();

export function readings(key: string): Readings {
	const hit = cache.get(key);
	if (hit) return hit;

	const c = checkpoint(key);
	const says = decode(c.says);
	const expects = decode(c.expects);
	const twin = decode(c.twin);
	const saysHt = residualizeHT(says, COINS);
	const expectsHt = residualizeHT(expects, COINS);
	const twinHt = residualizeHT(twin, COINS);
	const out = {
		says,
		expects,
		twin,
		saysHt,
		expectsHt,
		twinHt,
		saysRank: ranks(says),
		expectsRank: ranks(expects),
		twinRank: ranks(twin),
		saysHtRank: ranks(saysHt),
		expectsHtRank: ranks(expectsHt),
		twinHtRank: ranks(twinHt),
	};

	cache.set(key, out);

	return out;
}

export function checkpoint(key: string): Checkpoint {
	const c = STUDY.checkpoints[key];
	if (!c) throw new Error(`unknown checkpoint ${key}`);

	return c;
}

export function family(id: string): Family {
	return (
		STUDY.families.find((f) => f.id === id) ?? (STUDY.families[0] as Family)
	);
}

export function signed(x: number, digits = 2): string {
	const text = Math.abs(x).toFixed(digits);
	if (Number(text) === 0) return text;

	return `${x < 0 ? "−" : "+"}${text}`;
}

export function percent(x: number): string {
	const p = x * 100;

	return p >= 99 || p <= 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
}

export function band(switches: number): number {
	if (switches <= 4) return 0;
	if (switches <= 6) return 1;
	if (switches <= 8) return 2;
	if (switches <= 10) return 3;

	return 4;
}

export function agreementTitle(r: number): string {
	if (r >= 0.45) return "What it says follows what it expects.";
	if (r >= 0.15) return "What it says loosely follows what it expects.";
	if (r > -0.15) return "What it says has little to do with what it expects.";

	return "What it says runs against what it expects.";
}

function streaks(c: Checkpoint): string {
	if (c.template <= -0.15)
		return `It calls streaky coins rigged (r\u00a0=\u00a0${signed(c.template)} with how often the coin switches)`;
	if (c.template >= 0.15)
		return `It calls alternating coins rigged (r\u00a0=\u00a0${signed(c.template)} with how often the coin switches)`;

	return "Streaks barely change its answer";
}

function lean(c: Checkpoint): string {
	if (c.saysRigged >= 0.9)
		return `, and it calls nearly every fair coin rigged (typical answer ${percent(c.saysRigged)}).`;
	if (c.saysRigged <= 0.35)
		return `, and it leans fair overall (typical answer ${percent(c.saysRigged)} rigged).`;

	return ".";
}

export function detail(c: Checkpoint, cleanHt = false): string {
	if (cleanHt) {
		const rawR = c.agree[0] ?? 0;
		const htR = c.partialHt[0] ?? 0;
		const shift = htR - rawR;
		const fSays = c.features.says.firstH;
		const fExp = c.features.expects.firstH;
		if (Math.abs(shift) >= 0.2) {
			return `Removing whether the coin starts with H (says ${signed(fSays)}, expects ${signed(fExp)}) and its heads share shifts agreement from ${signed(rawR)} to ${signed(htR)}.${c.usable === 0 ? " Its answers also fail usability (0/3 wordings)." : ""}`;
		}
		if (c.usable === 0) {
			return `After removing H/T and first-flip bias, agreement is ${signed(htR)} (raw ${signed(rawR)}), and its answers still fail usability (0/3 wordings).`;
		}
		return `${streaks(c)}. With first-flip and H/T bias removed, say–expect agreement is ${signed(htR)} (raw ${signed(rawR)}).`;
	}

	if (c.usable === 0) {
		const fSays = Math.abs(c.features.says.firstH);
		const fExp = Math.abs(c.features.expects.firstH);
		const htHint =
			fSays >= 0.5 && fExp >= 0.4
				? ` Much of this correlation (${signed(c.agree[0] ?? 0)} raw vs ${signed(c.partialHt[0] ?? 0)} controlled) comes from whether the first flip is H or T.`
				: "";
		return `Its answer barely depends on the coin (usable in 0 of 3 wordings), so this pattern is a weak raw-text residual, not a verbal judgment.${htHint}`;
	}

	return `${streaks(c)}${lean(c)}`;
}

export function twinTitle(c: Checkpoint, cleanHt = false): string {
	const strongest = cleanHt
		? Math.max(Math.abs(c.statedTwinHt), Math.abs(c.twinExpectsHt))
		: Math.max(
				Math.abs(c.statedTwin),
				Math.abs(c.twinExpects),
				Math.abs(c.twinTemplate),
			);

	return strongest >= 0.3
		? "A nonsense question still sorts the coins."
		: "The nonsense question barely sorts the coins.";
}

export function twinDetail(c: Checkpoint, cleanHt = false): string {
	if (cleanHt) {
		return `After removing first-flip and H/T bias, zorp-or-blarg tracks real answers at r\u00a0=\u00a0${signed(c.statedTwinHt)} (raw ${signed(c.statedTwin)}) and predictions at r\u00a0=\u00a0${signed(c.twinExpectsHt)} (raw ${signed(c.twinExpects)}).`;
	}

	return `Its zorp-or-blarg answers move with its real answers (r\u00a0=\u00a0${signed(c.statedTwin)}), its predictions (r\u00a0=\u00a0${signed(c.twinExpects)}), and the first flip alone (r\u00a0=\u00a0${signed(c.features.twin.firstH)}).`;
}

export interface Picks {
	streaky: number;
	alternating: number;
	typical: number;
}

export function picks(coins: readonly Coin[]): Picks {
	let streaky = 0;
	let alternating = 0;
	let typical = -1;

	for (const coin of coins) {
		if (coin.switches < (coins[streaky]?.switches ?? FLIPS))
			streaky = coin.index;
		if (coin.switches > (coins[alternating]?.switches ?? -1))
			alternating = coin.index;
		if (typical < 0 && coin.switches === 8) typical = coin.index;
	}

	return { streaky, alternating, typical: Math.max(typical, 0) };
}

export function place(z: number, size: number, pad: number): number {
	const clipped = Math.max(-LIMIT, Math.min(LIMIT, z));

	return pad + ((clipped + LIMIT) / (2 * LIMIT)) * (size - 2 * pad);
}

export function nearest(
	xs: Float32Array,
	ys: Float32Array,
	x: number,
	y: number,
	size: number,
	pad: number,
	radius: number,
): number {
	let best = -1;
	let bestD = radius * radius;

	for (let i = 0; i < xs.length; i++) {
		const dx = place(xs[i] ?? 0, size, pad) - x;
		const dy = size - place(ys[i] ?? 0, size, pad) - y;
		const d = dx * dx + dy * dy;

		if (d <= bestD) {
			bestD = d;
			best = i;
		}
	}

	return best;
}

export function neighbor(
	values: Float32Array,
	from: number,
	step: 1 | -1,
): number {
	const order = Array.from({ length: values.length }, (_, i) => i).sort(
		(a, b) => (values[a] ?? 0) - (values[b] ?? 0) || a - b,
	);
	const at = order.indexOf(from);
	const next = Math.max(0, Math.min(order.length - 1, at + step));

	return order[next] ?? from;
}
