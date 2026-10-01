import type { Probe, Strip } from "./protocol";
import type { Scan } from "./reduce";

export interface Band {
	from: number;
	to: number;
	weight: number;
}

export interface Box {
	sigma: [number, number];
	from: number;
	to: number;
	found: number | null;
	live: boolean;
}

export interface Figure {
	top: number;
	ticks: number[];
	frontier: number;
	bands: Band[];
	zeros: number[];
	pairs: [number, number][];
	boxes: Box[];
	scanning: { from: number; to: number } | null;
}

const FLOOR = 10;
const PAIRS = 3;

export function ceiling(value: number): number {
	return 10 ** Math.ceil(Math.log10(Math.max(value, 100)));
}

export function ticks(top: number): number[] {
	const decades = Math.round(Math.log10(top / FLOOR));

	return Array.from({ length: decades + 1 }, (_, i) => FLOOR * 10 ** i);
}

function probeBox(probe: Probe): Box {
	return {
		sigma: [probe.sigmaFrom, probe.sigmaTo],
		from: probe.tFrom,
		to: probe.tTo,
		found: probe.zeros,
		live: false,
	};
}

export function boxKey(box: Box): string {
	return `${box.sigma[0]}:${box.sigma[1]}:${box.from}:${box.to}`;
}

function unique(boxes: Box[]): Box[] {
	const merged = new Map<string, Box>();

	for (const box of boxes) {
		const known = merged.get(boxKey(box));

		merged.set(
			boxKey(box),
			known ? { ...known, live: known.live || box.live } : box,
		);
	}

	return [...merged.values()];
}

export function figure(strip: Strip, frontier: number, scans: Scan[]): Figure {
	const liveZeros = scans.flatMap((s) => s.zeros);

	const reach = Math.max(
		frontier,
		strip.frontier,
		...liveZeros,
		...strip.probes.map((p) => p.tTo),
		...scans.map((s) => s.to),
	);

	const top = ceiling(reach);

	const heaviest = Math.max(
		...strip.bins.map((b) => b.zeros / Math.max(b.to - b.from, 1e-9)),
		1e-9,
	);

	const bands = strip.bins
		.filter((b) => b.zeros > 0)
		.map((b) => ({
			from: b.from,
			to: b.to,
			weight: b.zeros / Math.max(b.to - b.from, 1e-9) / heaviest,
		}));

	const zeros = [...new Set([...strip.recent, ...liveZeros])].sort(
		(a, b) => a - b,
	);

	const boxes = unique([
		...strip.probes.map(probeBox),
		...scans
			.filter((s) => s.kind === "contour" && s.sigma)
			.map((s) => ({
				sigma: s.sigma as [number, number],
				from: s.from,
				to: s.to,
				found: s.found,
				live: true,
			})),
	]);

	const line = scans.filter((s) => s.kind === "line").at(-1);

	return {
		top,
		ticks: ticks(top),
		frontier: Math.max(frontier, strip.frontier),
		bands,
		zeros,
		pairs: strip.closest.slice(0, PAIRS),
		boxes,
		scanning: line ? { from: line.from, to: line.to } : null,
	};
}

export function along(t: number, top: number): number {
	if (t <= FLOOR) return 0;

	return Math.min(Math.log(t / FLOOR) / Math.log(top / FLOOR), 1);
}
