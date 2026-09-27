import { writeFileSync } from "node:fs";

const SOURCE = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json";
const OUTPUT = new URL("../features/capacity/land-data.ts", import.meta.url);
const STEP = 1.5;
const NORTH = 80;
const SOUTH = -58;
const SAMPLES = [
	[0.5, 0.5],
	[0.2, 0.2],
	[0.8, 0.2],
	[0.2, 0.8],
	[0.8, 0.8],
];
const MIN_HITS = 2;

function decodeArcs(topology) {
	const [sx, sy] = topology.transform.scale;
	const [tx, ty] = topology.transform.translate;
	return topology.arcs.map((arc) => {
		let x = 0;
		let y = 0;
		return arc.map(([dx, dy]) => {
			x += dx;
			y += dy;
			return [x * sx + tx, y * sy + ty];
		});
	});
}

function stitch(arcs, indexes) {
	return indexes.flatMap((i, k) => {
		const arc = i < 0 ? [...arcs[~i]].reverse() : arcs[i];
		return k ? arc.slice(1) : arc;
	});
}

function unwrap(ring) {
	let shift = 0;
	return ring.map(([lon, lat], k) => {
		if (k) {
			const jump = lon - ring[k - 1][0];
			if (jump > 180) shift -= 360;
			else if (jump < -180) shift += 360;
		}
		return [lon + shift, lat];
	});
}

function withBounds(ring) {
	const lons = ring.map(([lon]) => lon);
	const lats = ring.map(([, lat]) => lat);
	return {
		ring,
		x0: Math.min(...lons),
		x1: Math.max(...lons),
		y0: Math.min(...lats),
		y1: Math.max(...lats),
	};
}

function rings(topology) {
	const arcs = decodeArcs(topology);
	return topology.objects.land.geometries
		.flatMap((g) => (g.type === "Polygon" ? [g.arcs] : g.arcs))
		.flatMap((polygon) =>
			polygon.map((indexes) => withBounds(unwrap(stitch(arcs, indexes)))),
		);
}

function crosses(ring, x, y) {
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
			inside = !inside;
	}
	return inside;
}

function onLand(all, lon, lat) {
	return [lon, lon - 360, lon + 360].some((x) => {
		const hits = all.filter(
			(r) =>
				x >= r.x0 &&
				x <= r.x1 &&
				lat >= r.y0 &&
				lat <= r.y1 &&
				crosses(r.ring, x, lat),
		);
		return hits.length % 2 === 1;
	});
}

function rasterize(all) {
	const cols = 360 / STEP;
	const rows = Math.round((NORTH - SOUTH) / STEP);
	const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const lon = -180 + c * STEP;
			const lat = NORTH - r * STEP;
			const hits = SAMPLES.filter(([fx, fy]) =>
				onLand(all, lon + fx * STEP, lat - fy * STEP),
			);
			if (hits.length >= MIN_HITS) {
				const i = r * cols + c;
				bits[i >> 3] |= 1 << (i & 7);
			}
		}
	}
	return { cols, rows, bits: Buffer.from(bits).toString("base64") };
}

function source({ cols, rows, bits }) {
	const lines = bits.match(/.{1,76}/g).map((chunk) => `\t\t"${chunk}",`);
	return `export const landData = {
\tstep: ${STEP},
\tnorth: ${NORTH},
\tcols: ${cols},
\trows: ${rows},
\tbits: [
${lines.join("\n")}
\t].join(""),
};
`;
}

const topology = await (await fetch(SOURCE)).json();
writeFileSync(OUTPUT, source(rasterize(rings(topology))));
