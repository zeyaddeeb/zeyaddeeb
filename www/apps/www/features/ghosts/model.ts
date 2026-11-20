import raw from "./study.json";

export interface Packed {
	scale: number;
	data: string;
}

export interface Checkpoint {
	label: string;
	stage: string;
	usable: number;
	agree: number[];
	partial: number;
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
}

export const STUDY: Study = raw;
export const FLIPS = 16;
export const LIMIT = 3;

export type Flip = "H" | "T";

export interface Coin {
	index: number;
	flips: Flip[];
	switches: number;
}

export interface Readings {
	says: Float32Array;
	expects: Float32Array;
	twin: Float32Array;
	saysRank: Uint8Array;
	expectsRank: Uint8Array;
	twinRank: Uint8Array;
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
		for (let j = 1; j < FLIPS; j++) if (flips[j] !== flips[j - 1]) switches++;

		coins.push({ index: i, flips, switches });
	}

	return coins;
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
	const out = {
		says,
		expects,
		twin,
		saysRank: ranks(says),
		expectsRank: ranks(expects),
		twinRank: ranks(twin),
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

export function detail(c: Checkpoint): string {
	if (c.usable === 0)
		return `Its answer barely depends on the coin (usable in 0 of 3 wordings), so this pattern is a faint echo of how it reads the flips, not a verdict.`;

	return `${streaks(c)}${lean(c)}`;
}

export function twinTitle(c: Checkpoint): string {
	const strongest = Math.max(
		Math.abs(c.statedTwin),
		Math.abs(c.twinExpects),
		Math.abs(c.twinTemplate),
	);

	return strongest >= 0.3
		? "A nonsense question still sorts the coins."
		: "The nonsense question barely sorts the coins.";
}

export function twinDetail(c: Checkpoint): string {
	return `Its zorp-or-blarg answers move with its real answers (r\u00a0=\u00a0${signed(c.statedTwin)}) and with its predictions (r\u00a0=\u00a0${signed(c.twinExpects)}). A tidy pattern proves nothing on its own.`;
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
