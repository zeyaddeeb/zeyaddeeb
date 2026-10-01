import { countyData } from "./county-data";
import {
	type Box,
	type Inset,
	type Label,
	type MapNode,
	overlaps,
	type Point,
	planTracks,
	spread,
	type Track,
} from "./geometry";
import type { GridWorld } from "./protocol";

export interface GridLayout {
	nodes: MapNode[];
	project: (lon: number, lat: number) => Point;
	compact: boolean;
}

const NARROW = 520;
const STRETCH = 1.7;
const CHAR_WIDTH = 7.2;
const DETAIL_WIDTH = 6.4;
const LINE_HEIGHT = 14;
const NODE_BOX = 15;
const FRACTIONS = [0.5, 0.35, 0.65, 0.22, 0.78];
const SPREAD = 44;
const EDGE = 26;
const LABEL_ROOM = { compact: 30, full: 46 };

export function gridLayout(
	grid: GridWorld,
	width: number,
	height: number,
	inset: Inset,
): GridLayout {
	const places = [
		...grid.hubs.map((h) => ({ ...h, kind: "site" as const })),
		...grid.substations.map((s) => ({ ...s, kind: "city" as const })),
	];

	const compact = width < NARROW;
	const room = compact ? LABEL_ROOM.compact : LABEL_ROOM.full;

	const pad = {
		top: inset.top + 10,
		bottom: inset.bottom + room,
		left: inset.left + 56,
		right: inset.right + 56,
	};

	const lat0 = places.reduce((a, p) => a + p.lat, 0) / places.length;
	const squeeze = Math.cos((lat0 * Math.PI) / 180);
	const xs = places.map((p) => p.lon * squeeze);
	const ys = places.map((p) => -p.lat);

	const [x0, x1, y0, y1] = [
		Math.min(...xs),
		Math.max(...xs),
		Math.min(...ys),
		Math.max(...ys),
	];

	const innerW = width - pad.left - pad.right;
	const innerH = height - pad.top - pad.bottom;
	const fit = innerW / (x1 - x0);
	const scale = Math.min(fit, innerH / (y1 - y0));
	const wide = Math.min(fit, scale * STRETCH);
	const cx = (x0 + x1) / 2;
	const cy = (y0 + y1) / 2;

	const project = (lon: number, lat: number): Point => ({
		x: pad.left + innerW / 2 + (lon * squeeze - cx) * wide,
		y: pad.top + innerH / 2 + (-lat - cy) * scale,
	});

	const nodes: MapNode[] = places.map((p) => ({
		id: p.id,
		kind: p.kind,
		title: p.name,
		...project(p.lon, p.lat),
	}));

	spread(nodes, SPREAD);

	for (const n of nodes) {
		n.x = Math.min(width - EDGE, Math.max(EDGE, n.x));

		n.y = Math.min(
			height - inset.bottom - EDGE,
			Math.max(inset.top + EDGE, n.y),
		);
	}

	return { nodes, project, compact };
}

const polyline = (
	project: GridLayout["project"],
	points: readonly (readonly [number, number])[],
) =>
	points
		.map(([lon, lat], i) => {
			const { x, y } = project(lon, lat);

			return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
		})
		.join("");

export interface Basemap {
	roads: string;
	river: string;
	runways: string;
	places: { name: string; x: number; y: number }[];
}

export function basemap(project: GridLayout["project"]): Basemap {
	return {
		roads: countyData.roads.map((r) => polyline(project, r.points)).join(""),
		river: countyData.river.map((r) => polyline(project, r)).join(""),
		runways: countyData.runways.map((r) => polyline(project, r)).join(""),
		places: countyData.places.map((p) => ({
			name: p.name,
			...project(p.lon, p.lat),
		})),
	};
}

export function gridTracks(
	grid: GridWorld,
	nodes: MapNode[],
): Map<string, Track> {
	const at = new Map(nodes.map((n) => [n.id, n]));

	const requests = [...grid.lines, ...grid.candidates].flatMap((line) => {
		const a = at.get(line.a);
		const b = at.get(line.b);

		return a && b ? [{ key: line.id, a, b }] : [];
	});

	return planTracks(requests, nodes);
}

export function labelBox(label: Label, detail: string): Box {
	const w = Math.max(
		label.title.length * CHAR_WIDTH,
		label.detail ? detail.length * DETAIL_WIDTH : 0,
	);

	const h = (label.detail ? 2 : 1) * LINE_HEIGHT;

	const x0 =
		label.anchor === "middle"
			? label.lx - w / 2
			: label.anchor === "start"
				? label.lx
				: label.lx - w;

	return { x0, y0: label.ly - 11, x1: x0 + w, y1: label.ly - 11 + h };
}

export function nodeBoxes(nodes: MapNode[]): Box[] {
	return nodes.map((n) => ({
		x0: n.x - NODE_BOX,
		y0: n.y - NODE_BOX,
		x1: n.x + NODE_BOX,
		y1: n.y + NODE_BOX,
	}));
}

export interface TagRequest {
	id: string;
	track: Track;
	width: number;
	height: number;
}

const around = (p: Point, w: number, h: number): Box => ({
	x0: p.x - w / 2,
	y0: p.y - h / 2,
	x1: p.x + w / 2,
	y1: p.y + h / 2,
});

function spots(track: Track): Point[] {
	const legs = track.points
		.slice(1)
		.map((b, i) => [track.points[i], b] as const)
		.sort(
			([a, b], [c, d]) =>
				Math.hypot(d.x - c.x, d.y - c.y) - Math.hypot(b.x - a.x, b.y - a.y),
		);

	return legs.flatMap(([a, b]) =>
		FRACTIONS.map((f) => ({
			x: a.x + (b.x - a.x) * f,
			y: a.y + (b.y - a.y) * f,
		})),
	);
}

export function placeTags(
	requests: TagRequest[],
	taken: Box[],
): Map<string, Point> {
	const placed = new Map<string, Point>();
	const busy = [...taken];

	const longestFirst = [...requests].sort(
		(a, b) => b.track.length - a.track.length,
	);

	for (const r of longestFirst) {
		const spot = spots(r.track).find(
			(p) => !busy.some((b) => overlaps(b, around(p, r.width, r.height))),
		);

		if (!spot) continue;

		busy.push(around(spot, r.width, r.height));
		placed.set(r.id, spot);
	}

	return placed;
}

export function clearPlaces(
	places: Basemap["places"],
	taken: Box[],
): Basemap["places"] {
	return places.filter(
		(p) =>
			!taken.some((b) =>
				overlaps(b, around(p, p.name.length * DETAIL_WIDTH + 12, 14)),
			),
	);
}

const TRACK_STEP = 10;
const TRACK_HALF = 5;

export function trackBoxes(tracks: Track[]): Box[] {
	return tracks.flatMap((t) =>
		t.points.slice(1).flatMap((b, i) => {
			const a = t.points[i];

			const steps = Math.max(
				1,
				Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / TRACK_STEP),
			);

			return Array.from({ length: steps + 1 }, (_, k) =>
				around(
					{
						x: a.x + ((b.x - a.x) * k) / steps,
						y: a.y + ((b.y - a.y) * k) / steps,
					},
					TRACK_HALF * 2,
					TRACK_HALF * 2,
				),
			);
		}),
	);
}
