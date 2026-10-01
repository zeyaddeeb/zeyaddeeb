export const WORDS = 8192;
export const CHIP = 256;
export const CHIPS = WORDS / CHIP;
export const COLS = 8;
export const ROWS = CHIPS / COLS;
export const FREE = 255;

export interface Gap {
	base: number;
	len: number;
}

export interface Routine {
	id: number;
	len: number;
}

export interface Move {
	routine: number;
	base: number;
}

export type Snap =
	| { kind: "fit"; gap: Gap; base: number }
	| { kind: "small"; gap: Gap }
	| { kind: "none" }
	| { kind: "dead" };

export const chipOf = (word: number) => Math.floor(word / CHIP);

export const hex = (n: number) =>
	`0x${n.toString(16).toUpperCase().padStart(4, "0")}`;

export function gapsOf(owners: ArrayLike<number>, dead: number | null): Gap[] {
	const out: Gap[] = [];
	let i = 0;

	while (i < WORDS) {
		if (owners[i] === FREE && chipOf(i) !== dead) {
			let j = i;

			while (j < WORDS && owners[j] === FREE && chipOf(j) !== dead) j++;

			out.push({ base: i, len: j - i });
			i = j;
		} else i++;
	}

	return out;
}

export const gapAt = (gaps: Gap[], word: number) =>
	gaps.find((g) => word >= g.base && word < g.base + g.len);

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
	Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function edge(gap: Gap, len: number, lo: number, hi: number) {
	const head = gap.base;
	const tail = gap.base + gap.len - len;

	return overlap(tail, tail + len, lo, hi) > overlap(head, head + len, lo, hi)
		? tail
		: head;
}

export function snap(
	gaps: Gap[],
	chip: number,
	len: number,
	dead: number | null,
): Snap {
	if (chip === dead) return { kind: "dead" };

	const lo = chip * CHIP;
	const hi = lo + CHIP;
	const near = gaps.filter((g) => overlap(g.base, g.base + g.len, lo, hi) > 0);
	const fit = near.filter((g) => g.len >= len).sort((a, b) => a.len - b.len)[0];

	if (fit) return { kind: "fit", gap: fit, base: edge(fit, len, lo, hi) };

	const big = [...near].sort((a, b) => b.len - a.len)[0];

	return big ? { kind: "small", gap: big } : { kind: "none" };
}

export function plan(gaps: Gap[], need: Routine[]): Move[] | null {
	const order = [...need].sort((a, b) => b.len - a.len);
	const room = gaps.map((g) => ({ base: g.base, left: g.len, used: 0 }));
	const out: Move[] = [];

	const go = (k: number): boolean => {
		if (k === order.length) return true;

		const r = order[k];
		const seen = new Set<number>();

		const bins = room
			.filter((b) => b.left >= r.len)
			.sort((a, b) => a.left - b.left || a.base - b.base);

		for (const b of bins) {
			if (seen.has(b.left)) continue;

			seen.add(b.left);
			out.push({ routine: r.id, base: b.base + b.used });
			b.left -= r.len;
			b.used += r.len;

			if (go(k + 1)) return true;

			b.left += r.len;
			b.used -= r.len;
			out.pop();
		}

		return false;
	};

	return go(0) ? out : null;
}

export interface Board {
	width: number;
	gap: number;
	chip: number;
	cell: number;
	height: number;
}

export function board(width: number, gap: number): Board {
	const chip = (width - gap * (COLS - 1)) / COLS;

	return {
		width,
		gap,
		chip,
		cell: chip / 16,
		height: chip * ROWS + gap * (ROWS - 1),
	};
}

export function origin(b: Board, chip: number) {
	return {
		x: (chip % COLS) * (b.chip + b.gap),
		y: Math.floor(chip / COLS) * (b.chip + b.gap),
	};
}

export function chipAt(b: Board, x: number, y: number, loose: boolean) {
	const step = b.chip + b.gap;
	let cx = Math.floor(x / step);
	let cy = Math.floor(y / step);

	if (loose) {
		cx = Math.min(COLS - 1, Math.max(0, Math.round((x - b.chip / 2) / step)));
		cy = Math.min(ROWS - 1, Math.max(0, Math.round((y - b.chip / 2) / step)));

		return cy * COLS + cx;
	}

	if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return -1;

	if (x - cx * step >= b.chip || y - cy * step >= b.chip) return -1;

	return cy * COLS + cx;
}

export function wordAt(b: Board, x: number, y: number) {
	const chip = chipAt(b, x, y, false);

	if (chip < 0) return -1;

	const o = origin(b, chip);
	const col = Math.min(15, Math.floor((x - o.x) / b.cell));
	const row = Math.min(15, Math.floor((y - o.y) / b.cell));

	return chip * CHIP + row * 16 + col;
}
