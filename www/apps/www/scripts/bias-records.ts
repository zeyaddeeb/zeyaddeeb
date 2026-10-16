import { writeFileSync } from "node:fs";
import { DRESSED, fitOf } from "../features/bias/atelier";
import { FORMS, type Form, type FormId, formOf } from "../features/bias/forms";
import { grainAt, type Press } from "../features/bias/net";

const STOPS = [0, 0.5, 0.7, 0.8, 0.866, 0.9];
const MOST = 8;
const RESTARTS = 5;
const ROUNDS = 140;
const GOAL = 0.997;

type Point = [number, number, number];

let seed = 20261016;

function random() {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = seed;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function project(form: Form, p: Point): Point | null {
	const g = new Float64Array(3);
	let [x, y, z] = p;

	for (let i = 0; i < 12; i++) {
		form.gradient(x, y, z, g);

		const f = form.value(x, y, z);
		const gg = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];

		x -= (f * g[0]) / gg;
		y -= (f * g[1]) / gg;
		z -= (f * g[2]) / gg;
	}

	if (!Number.isFinite(x + y + z) || form.rim(x, y, z) <= 0.05) return null;

	return [x, y, z];
}

function anywhere(form: Form): Point {
	const i = Math.floor(random() * (form.samples.length / 3));

	return [
		form.samples[i * 3],
		form.samples[i * 3 + 1],
		form.samples[i * 3 + 2],
	];
}

const pressOf = (form: Form, pin: Point, angle: number): Press => ({
	pin,
	warp: grainAt(form, pin, angle),
});

function angleOf(form: Form, press: Press) {
	const g = new Float64Array(3);
	const [x, y, z] = press.pin;

	form.gradient(x, y, z, g);

	const e = grainAt(form, press.pin, 0);
	const f = grainAt(form, press.pin, Math.PI / 2);
	const w = press.warp;

	return Math.atan2(
		w[0] * f[0] + w[1] * f[1] + w[2] * f[2],
		w[0] * e[0] + w[1] * e[1] + w[2] * e[2],
	);
}

function cover(id: FormId, fill: number, sewn: Press[], rough: boolean) {
	return fitOf({ form: id, fill, sewn, loose: null }, rough).fit.coverage;
}

function nudge(form: Form, press: Press, reach: number, turn: number): Press {
	if (random() < 0.35) {
		return pressOf(
			form,
			press.pin,
			angleOf(form, press) + (random() - 0.5) * 2 * turn,
		);
	}

	const d: Point = [random() - 0.5, random() - 0.5, random() - 0.5];
	const pin = project(form, [
		press.pin[0] + d[0] * reach,
		press.pin[1] + d[1] * reach,
		press.pin[2] + d[2] * reach,
	]);

	return pin ? pressOf(form, pin, angleOf(form, press)) : press;
}

function improve(id: FormId, fill: number, start: Press[]) {
	const form = formOf(id);
	let best = start;
	let score = cover(id, fill, best, true);
	let reach = 0.6;
	let turn = 0.5;
	let misses = 0;

	for (let round = 0; round < ROUNDS && score < GOAL; round++) {
		const i = Math.floor(random() * best.length);
		const next = best.slice();

		next[i] = nudge(form, best[i], reach, turn);

		const s = cover(id, fill, next, true);

		if (s > score) {
			best = next;
			score = s;
			misses = 0;
		} else if (++misses > 18) {
			reach *= 0.65;
			turn *= 0.65;
			misses = 0;
		}
	}

	return { layout: best, score };
}

const octahedron: Point[] = [
	[0, 0, 1],
	[0, 0, -1],
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
];

const tetrahedron: Point[] = [
	[1, 1, 1],
	[1, -1, -1],
	[-1, 1, -1],
	[-1, -1, 1],
].map(
	([x, y, z]) =>
		[x / Math.sqrt(3), y / Math.sqrt(3), z / Math.sqrt(3)] as Point,
);

function seeds(id: FormId, k: number): Press[][] {
	const form = formOf(id);
	const turned = (pins: Point[]) =>
		pins.map((p, i) => pressOf(form, p, i % 2 ? Math.PI / 4 : 0));
	const straight = (pins: Point[]) => pins.map((p) => pressOf(form, p, 0));

	if (id === "ball") {
		if (k === 1) return [straight([[0, 0, 1]])];
		if (k === 2)
			return [turned(octahedron.slice(0, 2)), straight(octahedron.slice(0, 2))];
		if (k === 4) return [turned(tetrahedron), straight(tetrahedron)];
		if (k === 6) return [turned(octahedron), straight(octahedron)];
	}

	if (id === "saddle" && k === 1) return [straight([[0, 0, 0]])];

	if (id === "bagel") {
		const ring = (n: number, r: number, z: number) =>
			Array.from({ length: n }, (_, i) => {
				const a = (2 * Math.PI * i) / n;

				return [r * Math.cos(a), r * Math.sin(a), z] as Point;
			});

		if (k === 2)
			return [
				[
					{ pin: [1.5, 0, 0], warp: [0, 1, 0] },
					{ pin: [-0.5, 0, 0], warp: [0, 1, 0] },
				],
			];
		if (k === 4) return [straight([...ring(2, 1.5, 0), ...ring(2, 0.5, 0)])];
		if (k === 6) return [straight([...ring(3, 1.5, 0), ...ring(3, 0.5, 0)])];
	}

	return [];
}

function fewest(id: FormId, fill: number, floor: number) {
	const form = formOf(id);

	for (let k = floor; k <= MOST; k++) {
		const starts = [
			...seeds(id, k),
			...Array.from({ length: RESTARTS }, () =>
				Array.from({ length: k }, () =>
					pressOf(form, anywhere(form), random() * Math.PI),
				),
			),
		];

		for (const start of starts) {
			const { layout, score } = improve(id, fill, start);

			if (score < GOAL) continue;

			const fine = cover(id, fill, layout, false);

			if (fine >= DRESSED) return { pieces: k, coverage: fine, layout };
		}

		console.log(`  ${id} fill ${fill}: no ${k}-piece dressing found`);
	}

	return null;
}

const round = (x: number) => Math.round(x * 1e5) / 1e5;

const records: Record<string, unknown[]> = {};

for (const id of FORMS) {
	records[id] = [];

	let floor = 1;

	for (const fill of STOPS) {
		const t = performance.now();
		const found = fewest(id, fill, floor);

		console.log(
			`${id} fill ${fill}: ${found ? `${found.pieces} pieces (${(found.coverage * 100).toFixed(2)}%)` : "none"} in ${((performance.now() - t) / 1000).toFixed(0)}s`,
		);

		if (!found) break;

		floor = found.pieces;
		records[id].push({
			fill,
			pieces: found.pieces,
			coverage: round(found.coverage),
			layout: found.layout.map((p) => ({
				pin: p.pin.map(round),
				grain: Math.round((angleOf(formOf(id), p) * 18000) / Math.PI) / 100,
			})),
		});
	}
}

writeFileSync(
	new URL("../features/bias/records-data.ts", import.meta.url),
	`import type { FormId } from "./forms";

export interface Laid {
	pin: [number, number, number];
	grain: number;
}

export interface Best {
	fill: number;
	pieces: number;
	coverage: number;
	layout: Laid[];
}

export const RECORDS: Record<FormId, Best[]> = ${JSON.stringify(records)};
`,
);
