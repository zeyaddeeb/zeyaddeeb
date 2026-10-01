import { writeFileSync } from "node:fs";

const MIRRORS = [
	"https://overpass.private.coffee/api/interpreter",
	"https://overpass-api.de/api/interpreter",
	"https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OUTPUT = new URL("../features/capacity/county-data.ts", import.meta.url);
const BOX = { south: 38.85, west: -77.64, north: 39.14, east: -77.36 };
const TOLERANCE = 0.0007;
const DIGITS = 4;
const PLACES = [
	"Leesburg",
	"Ashburn",
	"Sterling",
	"Brambleton",
	"Arcola",
	"South Riding",
	"Lansdowne",
	"Herndon",
	"Chantilly",
];
const ROADS = new Set(["VA 7", "VA 28", "VA 267", "US 50", "US 15"]);
const MIN_ROAD = 0.01;

const bbox = `${BOX.south},${BOX.west},${BOX.north},${BOX.east}`;
const query = `[out:json][timeout:120];
(
  way["waterway"="river"]["name"="Potomac River"](${bbox});
  way["highway"~"^(motorway|trunk|primary)$"]["ref"](${bbox});
  way["aeroway"="runway"](38.91,-77.49,38.97,-77.42);
  node["place"]["name"~"^(${PLACES.join("|")})$"](${bbox});
);
out geom tags;`;

async function overpass() {
	for (const mirror of MIRRORS) {
		try {
			const response = await fetch(mirror, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					"user-agent": "zeyaddeeb-capacity/0.1",
				},
				body: new URLSearchParams({ data: query }),
				signal: AbortSignal.timeout(180_000),
			});

			if (response.ok) return await response.json();
		} catch {}
	}

	throw new Error("every Overpass mirror failed");
}

function perpendicular([x, y], [x0, y0], [x1, y1]) {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const length = Math.hypot(dx, dy) || 1;

	return Math.abs(dy * x - dx * y + x1 * y0 - y1 * x0) / length;
}

function simplify(points) {
	if (points.length < 3) return points;

	let worst = 0;
	let at = 0;

	for (let i = 1; i < points.length - 1; i++) {
		const d = perpendicular(points[i], points[0], points.at(-1));

		if (d > worst) {
			worst = d;
			at = i;
		}
	}

	if (worst <= TOLERANCE) return [points[0], points.at(-1)];

	return [
		...simplify(points.slice(0, at + 1)).slice(0, -1),
		...simplify(points.slice(at)),
	];
}

const round = (n) => Number(n.toFixed(DIGITS));
const points = (way) => way.geometry.map((p) => [p.lon, p.lat]);
const finish = (chain) => simplify(chain).map(([x, y]) => [round(x), round(y)]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const reach = (chain) =>
	chain.reduce(
		(sum, p, i) =>
			i ? sum + Math.hypot(p[0] - chain[i - 1][0], p[1] - chain[i - 1][1]) : 0,
		0,
	);

function chains(parts) {
	const open = parts.map((p) => [...p]);
	const done = [];

	while (open.length) {
		let chain = open.pop();
		let grew = true;

		while (grew) {
			grew = false;

			for (let i = 0; i < open.length; i++) {
				const next = open[i];

				if (same(chain.at(-1), next[0])) chain = [...chain, ...next.slice(1)];
				else if (same(chain.at(-1), next.at(-1)))
					chain = [...chain, ...next.toReversed().slice(1)];
				else if (same(chain[0], next.at(-1)))
					chain = [...next, ...chain.slice(1)];
				else if (same(chain[0], next[0]))
					chain = [...next.toReversed(), ...chain.slice(1)];
				else continue;

				open.splice(i, 1);
				grew = true;

				break;
			}
		}

		done.push(chain);
	}

	return done;
}

function primaryRef(ref) {
	return ref
		.split(";")
		.map((r) => r.trim())
		.find((r) => ROADS.has(r));
}

function isOutbound(way) {
	const [first, last] = [way.geometry[0], way.geometry.at(-1)];
	const dx = last.lon - first.lon;
	const dy = last.lat - first.lat;

	return Math.abs(dx) > Math.abs(dy) ? dx > 0 : dy > 0;
}

const { elements } = await overpass();
const ways = elements.filter((e) => e.type === "way" && e.geometry);
const data = {
	river: chains(
		ways.filter((w) => w.tags.waterway === "river").map(points),
	).map(finish),
	roads: [...ROADS].flatMap((ref) =>
		chains(
			ways
				.filter((w) => w.tags.highway && primaryRef(w.tags.ref ?? "") === ref)
				.filter((w) => w.tags.oneway !== "yes" || isOutbound(w))
				.map(points),
		)
			.filter((chain) => reach(chain) > MIN_ROAD)
			.map((chain) => ({ ref, points: finish(chain) })),
	),
	runways: ways
		.filter((w) => w.tags.aeroway === "runway")
		.map((w) => finish(points(w))),
	places: PLACES.flatMap((name) => {
		const node = elements.find(
			(e) => e.type === "node" && e.tags?.name === name,
		);

		return node ? [{ name, lon: round(node.lon), lat: round(node.lat) }] : [];
	}),
};

writeFileSync(
	OUTPUT,
	`export const countyData = ${JSON.stringify(data)} as const;\n`,
);
