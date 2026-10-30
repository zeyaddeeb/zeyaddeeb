export type Kind = "ring" | "arch" | "tall" | "short" | "dot";

export interface Sort {
	kind: Kind;
	x: number;
	y: number;
	rot: number;
}

export interface Placed {
	kind: Kind;
	rot: number;
	x: number;
	y: number;
}

export const kinds: Kind[] = ["ring", "arch", "tall", "short", "dot"];

export const names: Record<Kind, string> = {
	ring: "Rings",
	arch: "Arches",
	tall: "Tall stems",
	short: "Short stems",
	dot: "Dots",
};

const body: Record<Kind, { w: number; h: number }> = {
	ring: { w: 3, h: 3 },
	arch: { w: 3, h: 3 },
	tall: { w: 1, h: 5 },
	short: { w: 1, h: 3 },
	dot: { w: 1, h: 1 },
};

export const bodyOf = (kind: Kind) => body[kind];

export function size(kind: Kind, rot = 0) {
	const { w, h } = body[kind];

	return rot % 2 ? { w: h, h: w } : { w, h };
}

const ring = (x: number): Sort => ({ kind: "ring", x, y: 2, rot: 0 });
const arch = (x: number, rot = 0): Sort => ({ kind: "arch", x, y: 2, rot });
const tall = (x: number, y = 0): Sort => ({ kind: "tall", x, y, rot: 0 });
const short = (x: number, rot = 0): Sort => ({ kind: "short", x, y: 2, rot });
const dot = (x: number): Sort => ({ kind: "dot", x, y: 0, rot: 0 });

export const alphabet: Record<string, Sort[]> = {
	a: [ring(0), short(2)],
	b: [ring(0), tall(0)],
	c: [arch(0, 3)],
	d: [ring(0), tall(2)],
	h: [arch(0), tall(0)],
	i: [short(0), dot(0)],
	j: [tall(0, 2), dot(0)],
	l: [tall(0)],
	m: [arch(0), arch(2)],
	n: [arch(0)],
	o: [ring(0)],
	p: [ring(0), tall(0, 2)],
	q: [ring(0), tall(2, 2)],
	t: [short(0, 1), tall(1)],
	u: [arch(0, 2)],
	w: [arch(0, 2), arch(2, 2)],
	y: [arch(0, 2), tall(2, 2)],
};

export const settable = (text: string) =>
	[...text].every((char) => char === " " || char in alphabet);

export function widthOf(char: string) {
	const sorts = alphabet[char] ?? [];

	return Math.max(0, ...sorts.map((s) => s.x + size(s.kind, s.rot).w));
}

const turnKey = (s: Sort) => (s.kind === "arch" ? s.rot : s.rot % 2);

function sign(sorts: Sort[]) {
	const left = Math.min(...sorts.map((s) => s.x));

	return sorts
		.map((s) => `${s.kind}${turnKey(s)}:${s.x - left},${s.y}`)
		.sort()
		.join(" ");
}

const named = new Map(
	Object.entries(alphabet).map(([char, sorts]) => [sign(sorts), char]),
);

export function read(sorts: Sort[]) {
	if (!sorts.length) return "";

	return named.get(sign(sorts)) ?? null;
}

const solo: Record<Kind, string> = {
	ring: "a ring",
	arch: "an arch",
	tall: "a stem",
	short: "a stem",
	dot: "a dot",
};

export function leftovers(char: string) {
	const sorts = alphabet[char] ?? [];

	if (sorts.length < 2) return [];

	return sorts.map((_, index) => {
		const rest = sorts.filter((__, other) => other !== index);
		const only = rest.length === 1 ? rest[0] : undefined;
		const shortBar = only?.kind === "short" && only.rot % 2 === 1;

		return (
			read(rest) ?? (shortBar ? "a bar" : only ? solo[only.kind] : "a scrap")
		);
	});
}

function unrotate(kind: Kind, rot: number, fx: number, fy: number) {
	const foot = size(kind, rot);
	const { w, h } = body[kind];
	let dx = fx - foot.w / 2;
	let dy = fy - foot.h / 2;

	for (let i = 0; i < rot; i++) [dx, dy] = [dy, -dx];

	return [w / 2 + dx, h / 2 + dy] as const;
}

function within(kind: Kind, u: number, v: number) {
	const { w, h } = body[kind];

	if (kind === "dot") return Math.hypot(u - 0.5, v - 0.5) <= 0.5;

	if (kind === "ring") {
		const r = Math.hypot(u - 1.5, v - 1.5);

		return r >= 0.5 && r <= 1.5;
	}

	if (kind === "arch") {
		if (v < 1.5) {
			const r = Math.hypot(u - 1.5, v - 1.5);

			return r >= 0.5 && r <= 1.5;
		}

		return v <= 3 && ((u >= 0 && u <= 1) || (u >= 2 && u <= 3));
	}

	return u >= 0 && u <= w && v >= 0 && v <= h;
}

export function contains(p: Placed, x: number, y: number) {
	const { w, h } = size(p.kind, p.rot);
	const fx = x - p.x;
	const fy = y - p.y;

	if (fx < 0 || fy < 0 || fx > w || fy > h) return false;

	const [u, v] = unrotate(p.kind, p.rot, fx, fy);

	return within(p.kind, u, v);
}

function outline(kind: Kind) {
	const points: [number, number][] = [];
	const ring = (cx: number, cy: number, radii: number[], upper: boolean) => {
		for (const r of radii)
			for (let i = 0; i < 16; i++) {
				const a = (i / 16) * Math.PI * 2;
				const y = cy + Math.sin(a) * r;

				if (!upper || y <= cy) points.push([cx + Math.cos(a) * r, y]);
			}
	};

	if (kind === "dot") {
		points.push([0.5, 0.5]);
		ring(0.5, 0.5, [0.45], false);
	} else if (kind === "ring") {
		ring(1.5, 1.5, [0.55, 1, 1.45], false);
	} else if (kind === "arch") {
		ring(1.5, 1.5, [0.55, 1, 1.45], true);

		for (const x of [0.05, 0.5, 0.95, 2.05, 2.5, 2.95])
			for (const y of [1.75, 2.25, 2.95]) points.push([x, y]);
	} else {
		const { w, h } = body[kind];

		for (let y = 0.05; y < h; y += 0.5)
			for (const x of [0.05, w / 2, w - 0.05]) points.push([x, y]);

		for (const x of [0.05, w / 2, w - 0.05]) points.push([x, h - 0.05]);
	}

	return points;
}

const cache = new Map<string, [number, number][]>();

function samples(kind: Kind, rot: number) {
	const key = `${kind}${rot}`;
	const hit = cache.get(key);

	if (hit) return hit;

	const foot = size(kind, rot);
	const { w, h } = body[kind];
	const turned = outline(kind).map(([u, v]) => {
		let dx = u - w / 2;
		let dy = v - h / 2;

		for (let i = 0; i < rot; i++) [dx, dy] = [-dy, dx];

		return [foot.w / 2 + dx, foot.h / 2 + dy] as [number, number];
	});

	cache.set(key, turned);

	return turned;
}

export function touches(a: Placed, b: Placed) {
	const sa = size(a.kind, a.rot);
	const sb = size(b.kind, b.rot);

	if (
		a.x > b.x + sb.w ||
		b.x > a.x + sa.w ||
		a.y > b.y + sb.h ||
		b.y > a.y + sa.h
	)
		return false;

	return (
		samples(a.kind, a.rot).some(([u, v]) => contains(b, a.x + u, a.y + v)) ||
		samples(b.kind, b.rot).some(([u, v]) => contains(a, b.x + u, b.y + v))
	);
}
