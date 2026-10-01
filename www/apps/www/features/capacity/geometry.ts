import { cells, landStep } from "./land";
import { type NodeKind, TRAINING } from "./plan";
import type { Level, World } from "./protocol";

export interface Point {
	x: number;
	y: number;
}

export interface MapNode extends Point {
	id: string;
	kind: NodeKind;
	title: string;
}

export interface Label extends MapNode {
	detail: boolean;
	lx: number;
	ly: number;
	anchor: "middle" | "start" | "end";
}

export interface Inset {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface Layout {
	nodes: MapNode[];
	project: (lon: number, lat: number) => Point;
	scale: number;
	compact: boolean;
	glyph: number;
}

export interface Box {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

const DENSE_NODES = 12;
const NARROW = 520;
const MAX_ZOOM_DEGREES = 24;
const SPREAD = { roomy: 46, dense: 26 };
const SPREAD_PASSES = 40;
const EDGE = 24;
const BEND_RADIUS = 14;
const LABEL_LINE = 14;
const LABEL_ROOM = { compact: 26, full: 46 };
const CHAR_WIDTH = 7.2;
const DETAIL_WIDTH = 6.4;
const DETAIL_SAMPLE = "000/000 MW · $000";

export const overlaps = (a: Box, b: Box) =>
	a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function toward(from: Point, to: Point, length: number): Point {
	const d = distance(from, to) || 1;

	return {
		x: from.x + ((to.x - from.x) / d) * length,
		y: from.y + ((to.y - from.y) / d) * length,
	};
}

export function spread(nodes: MapNode[], gap: number) {
	for (let pass = 0; pass < SPREAD_PASSES; pass++) {
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i];
				const b = nodes[j];
				let dx = b.x - a.x;
				let dy = b.y - a.y;
				let d = Math.hypot(dx, dy);

				if (d >= gap) continue;

				if (d < 0.01) {
					dx = dy = a.kind === "city" ? 1 : -1;
					d = Math.SQRT2;
				}

				const push = (gap - d) / 2;

				a.x -= (dx / d) * push;
				a.y -= (dy / d) * push;
				b.x += (dx / d) * push;
				b.y += (dy / d) * push;
			}
		}
	}
}

export function layout(
	world: World,
	level: Level,
	width: number,
	height: number,
	inset: Inset,
): Layout {
	const places = [
		...world.sites
			.filter((s) => s.id in level.capacity)
			.map((s) => ({ ...s, kind: "site" as const })),
		...world.cities
			.filter((c) => c.id in level.demand)
			.map((c) => ({ ...c, kind: "city" as const })),
	];

	const compact = places.length > DENSE_NODES || width < NARROW;
	const dense = places.length > DENSE_NODES && width < 700;
	const room = compact ? LABEL_ROOM.compact : LABEL_ROOM.full;

	const pad = {
		top: inset.top + 8,
		bottom: inset.bottom + room,
		left: inset.left + 48,
		right: inset.right + 48,
	};

	const xs = places.map((p) => p.lon);
	const ys = places.map((p) => -p.lat);

	const [x0, x1, y0, y1] = [
		Math.min(...xs),
		Math.max(...xs),
		Math.min(...ys),
		Math.max(...ys),
	];

	const innerW = width - pad.left - pad.right;
	const innerH = height - pad.top - pad.bottom;

	const scale = Math.min(
		innerW / Math.max(x1 - x0, 1),
		innerH / Math.max(y1 - y0, 1),
		width / MAX_ZOOM_DEGREES,
	);

	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;

	const project = (lon: number, lat: number): Point => ({
		x: pad.left + innerW / 2 + (lon - cx) * scale,
		y: pad.top + innerH / 2 + (-lat - cy) * scale,
	});

	const nodes: MapNode[] = places.map((p) => ({
		id: p.id,
		kind: p.kind,
		title: p.name,
		...project(p.lon, p.lat),
	}));

	spread(nodes, dense ? SPREAD.dense : SPREAD.roomy);

	for (const n of nodes) {
		n.x = Math.min(width - EDGE, Math.max(EDGE, n.x));

		n.y = Math.min(
			height - inset.bottom - EDGE,
			Math.max(inset.top + EDGE, n.y),
		);
	}

	if (level.training)
		nodes.push({
			id: TRAINING,
			kind: "training",
			title: "Training",
			x: inset.left + 40,
			y: height - inset.bottom - 48,
		});

	return { nodes, project, scale, compact, glyph: dense ? 0.7 : 1 };
}

function fitLabel(
	n: MapNode,
	lines: number,
	taken: Box[],
	width: number,
	top: number,
	bottom: number,
): Label | null {
	const w = Math.max(
		n.title.length * CHAR_WIDTH,
		lines > 1 ? DETAIL_SAMPLE.length * DETAIL_WIDTH : 0,
	);

	const h = lines * LABEL_LINE;

	const options: [number, number, Label["anchor"]][] = [
		[0, 20, "middle"],
		[0, -20 - h, "middle"],
		[18, -h / 2 + 2, "start"],
		[-18, -h / 2 + 2, "end"],
		[16, 14, "start"],
		[-16, 14, "end"],
		[0, 36, "middle"],
	];

	for (const [dx, dy, anchor] of options) {
		const left =
			anchor === "middle"
				? n.x + dx - w / 2
				: anchor === "start"
					? n.x + dx
					: n.x + dx - w;

		const box = { x0: left, y0: n.y + dy, x1: left + w, y1: n.y + dy + h };
		const inside =
			box.x0 >= 4 && box.x1 <= width - 4 && box.y0 >= top && box.y1 <= bottom;

		if (inside && !taken.some((t) => overlaps(t, box))) {
			taken.push(box);

			return {
				...n,
				detail: lines > 1,
				lx: n.x + dx,
				ly: n.y + dy + 11,
				anchor,
			};
		}
	}

	return null;
}

export function labels(
	nodes: MapNode[],
	compact: boolean,
	width: number,
	height: number,
	inset: Inset,
	obstacles: Box[] = [],
): Label[] {
	const taken: Box[] = [
		...nodes.map((n) => ({
			x0: n.x - 15,
			y0: n.y - 15,
			x1: n.x + 15,
			y1: n.y + 15,
		})),
		...obstacles,
	];

	const tries = compact ? [1] : [2, 1];

	return nodes.flatMap((n) => {
		for (const lines of tries) {
			const label = fitLabel(n, lines, taken, width, inset.top, height - 4);

			if (label) return [label];
		}

		return [];
	});
}

export interface Track {
	d: string;
	mid: Point;
	length: number;
	points: Point[];
}

export type Bend = "early" | "late" | "across" | "down" | "none";

const BENDS: Bend[] = ["early", "late", "across", "down", "none"];
const STATION_CLEARANCE = 22;
const TRACK_SPACING = 6;
const SHARED_END = 22;
const SAMPLE_STEP = 8;
const COST = { station: 12, overlap: 1, square: 2, straight: 3 };

function corner(a: Point, b: Point, bend: Bend): Point | null {
	if (bend === "none") return null;

	if (bend === "across") return { x: b.x, y: a.y };

	if (bend === "down") return { x: a.x, y: b.y };

	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
	const sx = Math.sign(dx);
	const sy = Math.sign(dy);

	if (bend === "late")
		return { x: a.x + sx * diagonal, y: a.y + sy * diagonal };

	return Math.abs(dx) > Math.abs(dy)
		? { x: a.x + sx * (Math.abs(dx) - diagonal), y: a.y }
		: { x: a.x, y: a.y + sy * (Math.abs(dy) - diagonal) };
}

export function octilinear(
	a: Point,
	b: Point,
	bend: Bend = "early",
	radius = BEND_RADIUS,
): Track {
	const fmt = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
	const knee = corner(a, b, bend);
	const first = knee ? distance(a, knee) : 0;
	const second = knee ? distance(knee, b) : 0;

	if (!knee || first < 1 || second < 1)
		return {
			d: `M${fmt(a)}L${fmt(b)}`,
			mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
			length: distance(a, b),
			points: [a, b],
		};

	const r = Math.min(radius, first / 2, second / 2);

	const mid =
		first >= second
			? { x: (a.x + knee.x) / 2, y: (a.y + knee.y) / 2 }
			: { x: (knee.x + b.x) / 2, y: (knee.y + b.y) / 2 };

	return {
		d: `M${fmt(a)}L${fmt(toward(knee, a, r))}Q${fmt(knee)} ${fmt(toward(knee, b, r))}L${fmt(b)}`,
		mid,
		length: first + second,
		points: [a, knee, b],
	};
}

function sample(a: Point, b: Point, bend: Bend): Point[] {
	const knee = corner(a, b, bend);

	const legs: [Point, Point][] = knee
		? [
				[a, knee],
				[knee, b],
			]
		: [[a, b]];

	return legs.flatMap(([from, to]) => {
		const steps = Math.max(1, Math.ceil(distance(from, to) / SAMPLE_STEP));

		return Array.from({ length: steps + 1 }, (_, i) => ({
			x: from.x + ((to.x - from.x) * i) / steps,
			y: from.y + ((to.y - from.y) * i) / steps,
		}));
	});
}

export interface TrackRequest {
	key: string;
	a: MapNode;
	b: MapNode;
}

export function planTracks(
	requests: TrackRequest[],
	nodes: MapNode[],
): Map<string, Track> {
	const drawn: Point[] = [];
	const tracks = new Map<string, Track>();

	const longestFirst = [...requests].sort(
		(p, q) => distance(q.a, q.b) - distance(p.a, p.b),
	);

	for (const { key, a, b } of longestFirst) {
		const away = (p: Point) =>
			distance(p, a) > SHARED_END && distance(p, b) > SHARED_END;
		const others = nodes.filter((n) => n.id !== a.id && n.id !== b.id);

		const cost = (points: Point[], bend: Bend) => {
			const stations = others.filter((n) =>
				points.some((p) => distance(p, n) < STATION_CLEARANCE),
			).length;

			const overlaps = points.filter(
				(p) => away(p) && drawn.some((q) => distance(p, q) < TRACK_SPACING),
			).length;

			return (
				stations * COST.station +
				overlaps * COST.overlap +
				(bend === "none" ? COST.straight : 0) +
				(bend === "across" || bend === "down" ? COST.square : 0)
			);
		};

		const options = BENDS.map((bend) => ({ bend, points: sample(a, b, bend) }));

		const best = options.reduce((x, y) =>
			cost(y.points, y.bend) < cost(x.points, x.bend) ? y : x,
		);

		drawn.push(...best.points.filter(away));
		tracks.set(key, octilinear(a, b, best.bend));
	}

	return tracks;
}

export function clearOf(nodes: MapNode[], p: Point, clearance = 26): boolean {
	return nodes.every((n) => distance(n, p) >= clearance);
}

export function landDots(
	project: Layout["project"],
	scale: number,
	width: number,
	height: number,
): string {
	const r = Math.max(0.7, landStep * scale * 0.2);
	const margin = r * 2;
	let d = "";

	for (const cell of cells()) {
		const { x, y } = project(cell.lon, cell.lat);

		if (x < -margin || y < -margin || x > width + margin || y > height + margin)
			continue;

		d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`;
	}

	return d;
}

export function wedge(r: number, share: number): string {
	if (share <= 0.001) return "";

	if (share >= 0.999)
		return `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

	const angle = share * 2 * Math.PI;
	const x = r * Math.sin(angle);
	const y = -r * Math.cos(angle);

	return `M0 0L0 ${-r}A${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`;
}

export interface Size {
	width: number;
	height: number;
}

const CALLOUT_GAP = 10;
const CALLOUT_CLEARANCE = 18;

function covers(box: Box, p: Point, margin = CALLOUT_CLEARANCE): boolean {
	return (
		p.x > box.x0 - margin &&
		p.x < box.x1 + margin &&
		p.y > box.y0 - margin &&
		p.y < box.y1 + margin
	);
}

export function placeCallout(
	nodes: MapNode[],
	track: Track,
	endpoints: [Point, Point],
	box: Size,
	map: Size,
	inset: Inset,
): Point {
	const { width: w, height: h } = box;
	const left = CALLOUT_GAP;
	const right = map.width - w - CALLOUT_GAP;
	const top = inset.top;
	const bottom = map.height - h - CALLOUT_GAP;
	const clampX = (x: number) => Math.min(right, Math.max(left, x));

	const candidates: Point[] = [
		{ x: clampX(track.mid.x - w / 2), y: track.mid.y + 22 },
		{ x: clampX(track.mid.x - w / 2), y: track.mid.y - h - 22 },
		{ x: left, y: bottom },
		{ x: right, y: bottom },
		{ x: right, y: top },
		{ x: left, y: top },
	].filter((c) => c.y >= top && c.y <= bottom);

	const marks = [track.mid, ...endpoints];

	const cost = (c: Point) => {
		const area = { x0: c.x, y0: c.y, x1: c.x + w, y1: c.y + h };
		const hidden = nodes.filter((n) => covers(area, n)).length;
		const onRoute = marks.filter((m) => covers(area, m, 6)).length;

		return hidden + onRoute * 10;
	};

	return candidates.reduce(
		(best, c) => (cost(c) < cost(best) ? c : best),
		candidates[0] ?? { x: left, y: bottom },
	);
}
