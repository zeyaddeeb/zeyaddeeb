import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SOURCE =
	"https://eyes.nasa.gov/assets/static/models/sc_voyager/Voyager.gltf";
const OUTPUT = fileURLToPath(
	new URL("../public/voyager/voyager.glb", import.meta.url),
);
const TOOLS =
	process.env.VOYAGER_MODEL_TOOLS ?? join(tmpdir(), "voyager-model-tools");
const PACKAGES = {
	"@gltf-transform/core": "4.5.1",
	"@gltf-transform/extensions": "4.5.1",
	"@gltf-transform/functions": "4.5.1",
	meshoptimizer: "1.3.0",
	sharp: "0.35.5",
};

export const PARTS = [
	"bus",
	"hga",
	"boom",
	"rtg",
	"mag",
	"pws",
	"scan",
	"pls",
	"crs",
	"lecp",
	"record",
];
export const DISH = 3.66;
export const SCIENCE_AZIMUTH = -8;

const MATERIALS = {
	tex_01: "body",
	"brass.001": "brass",
	black_krinkle: "blanket",
	tex_02_AO: "dish",
	tex_02_AO_other: "dish-back",
};

const EXPLODE = {
	bus: [0, 0, 0],
	hga: [0, 1.3, 0],
	boom: [0, 0, 0],
	rtg: [0, -0.05, 1.15],
	mag: [0, 0.5, 0.66],
	pws: [0, -0.7, 0.35],
	scan: [0, 0.3, -1.05],
	pls: [0, 1.2, -0.3],
	crs: [0, 0.72, 0],
	lecp: [0.063, 1.25, -0.294],
	record: [1.62, -0.55, -0.45],
};

const RTG_CUTS = [3.14, 3.69];
const RTG_SPREAD = [0, 0, 0.32];

const TARGETS = {
	bus: [0.78, 0, -0.57],
	hga: [1.95, 1.42, 0],
	boom: [0.09, 0.95, -1.9],
	rtg: [0, 0.25, 3.41],
	mag: [0, 1.8, 3.2],
	pws: [1.25, -0.5, 1.6],
	scan: [0, 1.1, -3.55],
	pls: [0, 1.2, -2.8],
	crs: [0, 1.25, -2.25],
	lecp: [0.3, 0.4, -2.4],
	record: [1.2, 0.03, 0],
};

export function classify(c) {
	const [x, y, z] = c.center;
	const [sx, sy, sz] = c.size;
	const truss = c.tris <= 6 && Math.abs(x) < 0.1 && y > 0.73 && y < 0.93;

	if (c.material.startsWith("brass")) return "pws";

	if (c.material.startsWith("tex_02")) return "hga";

	if (c.material === "black_krinkle") return "bus";

	if (c.max[1] > 2.4 && z > 1) return "mag";

	if (
		Math.abs(x) < 0.32 &&
		y > 0.38 &&
		z > 1.05 &&
		z < 1.9 &&
		Math.max(sx, sy, sz) < 0.8
	)
		return "mag";

	if (Math.abs(x) < 1.2 && Math.abs(z) < 1.2 && y > 0.85 && c.max[1] < 2.4)
		return "hga";

	if (Math.abs(x - 0.91) < 0.06 && Math.abs(y) < 0.1 && sx < 0.05)
		return "record";

	if (z > 2.55) return "rtg";

	if (z < -3.0 && !truss) return "scan";

	if (z < -2.55 && z > -3.0 && y > 0.93) return "pls";

	if (z < -2.7 && z > -2.9 && !truss && Math.min(sx, sy, sz) > 0.1 && y > 0.8)
		return "pls";

	if (z < -2.05 && z > -2.45 && y > 0.93) return "crs";

	if (z < -2.1 && z > -2.6 && y < 0.72 && Math.abs(x) < 0.4) return "lecp";

	if (z < -0.98 || z > 0.96) return "boom";

	return "bus";
}

async function tools() {
	const ready = Object.keys(PACKAGES).every((name) =>
		existsSync(join(TOOLS, "node_modules", name, "package.json")),
	);

	if (!ready) {
		mkdirSync(TOOLS, { recursive: true });

		writeFileSync(
			join(TOOLS, "package.json"),
			JSON.stringify(
				{ private: true, type: "module", dependencies: PACKAGES },
				null,
				2,
			),
		);

		const run = spawnSync(
			"npm",
			["install", "--no-audit", "--no-fund", "--loglevel=error"],
			{ cwd: TOOLS, stdio: ["ignore", 2, 2] },
		);

		if (run.status !== 0) throw new Error(`npm install failed in ${TOOLS}`);
	}

	const entry = join(TOOLS, "voyager-model-entry.mjs");

	writeFileSync(
		entry,
		[
			'export * as core from "@gltf-transform/core";',
			'export * as extensions from "@gltf-transform/extensions";',
			'export * as functions from "@gltf-transform/functions";',
			'export { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";',
			'export { default as sharp } from "sharp";',
			"",
		].join("\n"),
	);

	return import(pathToFileURL(entry).href);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (length(a) || 1));
const round = (a, digits = 3) => a.map((v) => Number(v.toFixed(digits)) || 0);

function components(prim) {
	const position = prim.getAttribute("POSITION");
	const indices = prim.getIndices().getArray();
	const count = position.getCount();

	const points = Array.from({ length: count }, (_, i) =>
		position.getElement(i, []),
	);

	const weld = new Map();
	const rep = new Int32Array(count);

	for (let i = 0; i < count; i++) {
		const key = points[i].map((v) => Math.round(v * 1e4)).join(",");

		if (!weld.has(key)) weld.set(key, i);

		rep[i] = weld.get(key);
	}

	const parent = Int32Array.from({ length: count }, (_, i) => i);

	const find = (i) => {
		let r = i;

		while (parent[r] !== r) {
			parent[r] = parent[parent[r]];
			r = parent[r];
		}

		return r;
	};

	for (let t = 0; t < indices.length; t += 3) {
		const a = find(rep[indices[t]]);
		const b = find(rep[indices[t + 1]]);
		const c = find(rep[indices[t + 2]]);

		parent[a] = c;
		parent[b] = c;
	}

	const groups = new Map();

	for (let t = 0; t < indices.length; t += 3) {
		const r = find(rep[indices[t]]);
		let g = groups.get(r);

		if (!g) {
			g = {
				triangles: [],
				min: [Infinity, Infinity, Infinity],
				max: [-Infinity, -Infinity, -Infinity],
				area: 0,
				weighted: [0, 0, 0],
			};

			groups.set(r, g);
		}

		g.triangles.push(t / 3);

		const [p, q, s] = [
			points[indices[t]],
			points[indices[t + 1]],
			points[indices[t + 2]],
		];

		const area = length(cross(sub(q, p), sub(s, p))) / 2;

		g.area += area;
		g.weighted = add(g.weighted, mul(add(add(p, q), s), area / 3));

		for (const v of [p, q, s])
			for (let d = 0; d < 3; d++) {
				g.min[d] = Math.min(g.min[d], v[d]);
				g.max[d] = Math.max(g.max[d], v[d]);
			}
	}

	return [...groups.values()];
}

function closest(p, a, b, c) {
	const ab = sub(b, a);
	const ac = sub(c, a);
	const ap = sub(p, a);
	const d1 = dot(ab, ap);
	const d2 = dot(ac, ap);

	if (d1 <= 0 && d2 <= 0) return a;

	const bp = sub(p, b);
	const d3 = dot(ab, bp);
	const d4 = dot(ac, bp);

	if (d3 >= 0 && d4 <= d3) return b;

	const vc = d1 * d4 - d3 * d2;

	if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));

	const cp = sub(p, c);
	const d5 = dot(ab, cp);
	const d6 = dot(ac, cp);

	if (d6 >= 0 && d5 <= d6) return c;

	const vb = d5 * d2 - d1 * d6;

	if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));

	const va = d3 * d6 - d5 * d4;

	if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
		return add(b, mul(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));

	const denom = 1 / (va + vb + vc);

	return add(a, add(mul(ab, vb * denom), mul(ac, vc * denom)));
}

function surface(prims, target) {
	let best = null;
	let bestDistance = Infinity;

	for (const prim of prims) {
		const position = prim.getAttribute("POSITION");
		const indices = prim.getIndices().getArray();

		for (let t = 0; t < indices.length; t += 3) {
			const p = closest(
				target,
				position.getElement(indices[t], []),
				position.getElement(indices[t + 1], []),
				position.getElement(indices[t + 2], []),
			);

			const d = length(sub(p, target));

			if (d < bestDistance) {
				bestDistance = d;
				best = p;
			}
		}
	}

	return best;
}

function vertices(prims) {
	const out = [];

	for (const prim of prims) {
		const position = prim.getAttribute("POSITION");

		for (let i = 0; i < position.getCount(); i++)
			out.push(position.getElement(i, []));
	}

	return out;
}

function bounds(prims) {
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];

	for (const v of vertices(prims))
		for (let d = 0; d < 3; d++) {
			min[d] = Math.min(min[d], v[d]);
			max[d] = Math.max(max[d], v[d]);
		}

	return {
		center: round(min.map((v, d) => (v + max[d]) / 2)),
		size: round(max.map((v, d) => v - min[d])),
	};
}

const triangles = (prims) =>
	prims.reduce((n, prim) => n + prim.getIndices().getCount() / 3, 0);

function slice(doc, buffer, prim, axis, cuts) {
	const semantics = prim.listSemantics();
	const source = semantics.map((s) => prim.getAttribute(s));
	const position = prim.getAttribute("POSITION");
	const indices = prim.getIndices().getArray();
	const along = (i) => dot(position.getElement(i, []), axis);
	const band = (d) => cuts.filter((c) => d > c).length;
	const read = (i) => source.map((a) => a.getElement(i, []));

	const mix = (a, b, t) =>
		a.map((values, k) => {
			const v = values.map((x, j) => x + (b[k][j] - x) * t);

			if (semantics[k] === "NORMAL") return unit(v);

			if (semantics[k] === "TANGENT")
				return [...unit(v.slice(0, 3)), values[3]];

			return v;
		});

	const bands = cuts
		.concat([null])
		.map(() => ({ data: [], index: [], seen: new Map() }));

	const vertex = (b, p) => {
		const target = bands[b];

		if (p.i !== undefined && target.seen.has(p.i)) return target.seen.get(p.i);

		target.data.push(p.data ?? read(p.i));

		if (p.i !== undefined) target.seen.set(p.i, target.data.length - 1);

		return target.data.length - 1;
	};

	const clip = (poly, plane, sign) => {
		const out = [];

		poly.forEach((a, k) => {
			const b = poly[(k + 1) % poly.length];
			const da = sign * (a.d - plane);
			const db = sign * (b.d - plane);

			if (da >= 0) out.push(a);

			if (da >= 0 !== db >= 0)
				out.push({
					d: plane,
					data: mix(a.data ?? read(a.i), b.data ?? read(b.i), da / (da - db)),
				});
		});

		return out;
	};

	for (let t = 0; t < indices.length; t += 3) {
		const tri = [indices[t], indices[t + 1], indices[t + 2]];
		const d = tri.map(along);
		const lo = band(Math.min(...d));
		const hi = band(Math.max(...d));

		for (let b = lo; b <= hi; b++) {
			let poly = tri.map((i, k) => ({ i, d: d[k] }));

			if (lo !== hi && b > 0) poly = clip(poly, cuts[b - 1], 1);

			if (lo !== hi && b < cuts.length) poly = clip(poly, cuts[b], -1);

			const ids = poly.map((p) => vertex(b, p));

			for (let k = 1; k + 1 < ids.length; k++)
				bands[b].index.push(ids[0], ids[k], ids[k + 1]);
		}
	}

	return bands.map(({ data, index }) => {
		const next = doc
			.createPrimitive()
			.setMaterial(prim.getMaterial())
			.setIndices(
				doc
					.createAccessor()
					.setType("SCALAR")
					.setArray(new Uint32Array(index))
					.setBuffer(buffer),
			);

		semantics.forEach((semantic, k) => {
			const size = source[k].getElementSize();
			const array = new Float32Array(data.length * size);

			data.forEach((values, v) => {
				array.set(values[k], v * size);
			});

			next.setAttribute(
				semantic,
				doc
					.createAccessor()
					.setType(source[k].getType())
					.setArray(array)
					.setBuffer(buffer),
			);
		});

		return next;
	});
}

const azimuth = (v) => (Math.atan2(v[2], v[0]) * 180) / Math.PI;
const elevation = (v) =>
	(Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180) / Math.PI;
const heading = (v) => ({
	dir: round(unit(v)),
	azimuth: Number(azimuth(v).toFixed(1)),
	elevation: Number(elevation(v).toFixed(1)),
});

export async function build(source = SOURCE, output = OUTPUT) {
	const { core, extensions, functions, MeshoptEncoder, MeshoptDecoder, sharp } =
		await tools();

	await MeshoptEncoder.ready;
	await MeshoptDecoder.ready;

	const io = new core.NodeIO(fetch)
		.setAllowNetwork(true)
		.registerExtensions(extensions.ALL_EXTENSIONS)
		.registerDependencies({
			"meshopt.encoder": MeshoptEncoder,
			"meshopt.decoder": MeshoptDecoder,
		});

	const doc = await io.read(/^https?:/.test(source) ? source : resolve(source));

	doc.setLogger(new core.Logger(core.Logger.Verbosity.ERROR));

	const root = doc.getRoot();
	const buffer = root.listBuffers()[0];

	const sources = [];

	for (const node of root.listNodes()) {
		const mesh = node.getMesh();

		if (!mesh) continue;

		const world = node.getWorldMatrix();

		for (const prim of mesh.listPrimitives()) {
			const material = prim.getMaterial()?.getName() ?? "";

			if (!(material in MATERIALS))
				throw new Error(`unexpected material ${material} in ${source}`);

			for (const semantic of prim.listSemantics())
				prim.setAttribute(semantic, prim.getAttribute(semantic).clone());

			prim.setIndices(prim.getIndices().clone());
			functions.transformPrimitive(prim, world);

			const comps = components(prim).map((c) => ({
				...c,
				material,
				tris: c.triangles.length,
			}));

			sources.push({ prim, material, comps });
		}
	}

	const all = sources.flatMap((s) => s.comps);
	const dish = all.reduce((a, b) => (b.area > a.area ? b : a));

	const axis = [
		(dish.min[0] + dish.max[0]) / 2,
		(dish.min[2] + dish.max[2]) / 2,
	];

	const diameter = Math.max(
		dish.max[0] - dish.min[0],
		dish.max[2] - dish.min[2],
	);

	const bus = all
		.filter(
			(c) =>
				c !== dish &&
				c.max[1] < dish.min[1] &&
				Math.hypot(
					(c.min[0] + c.max[0]) / 2 - axis[0],
					(c.min[2] + c.max[2]) / 2 - axis[1],
				) <
					diameter * 0.1,
		)
		.reduce((a, b) => (b.area > a.area ? b : a));

	const center = bus.min.map((v, d) => (v + bus.max[d]) / 2);
	const scale = DISH / diameter;

	for (const c of all) {
		c.min = mul(sub(c.min, center), scale);
		c.max = mul(sub(c.max, center), scale);
		c.center = c.min.map((v, d) => (v + c.max[d]) / 2);
		c.size = c.min.map((v, d) => c.max[d] - v);
		c.centroid = mul(sub(mul(c.weighted, 1 / (c.area || 1)), center), scale);
		c.part = classify(c);
	}

	const scan = all.filter((c) => c.part === "scan");

	const scanCenter = scan
		.reduce((a, c) => add(a, mul(c.centroid, c.area)), [0, 0, 0])
		.map((v) => v / scan.reduce((a, c) => a + c.area, 0));

	const turn = ((SCIENCE_AZIMUTH - azimuth(scanCenter)) * Math.PI) / 180;
	const cos = Math.cos(turn);
	const sin = Math.sin(turn);

	const rotate = (v) => [
		v[0] * cos - v[2] * sin,
		v[1],
		v[0] * sin + v[2] * cos,
	];

	const matrix = [
		cos * scale,
		0,
		sin * scale,
		0,
		0,
		scale,
		0,
		0,
		-sin * scale,
		0,
		cos * scale,
		0,
		...rotate(mul(center, -scale)),
		1,
	];

	for (const { prim } of sources) functions.transformPrimitive(prim, matrix);

	const materials = new Map();

	const material = (part, src) => {
		const key = `${part}.${MATERIALS[src.getName()]}`;

		if (!materials.has(key)) materials.set(key, src.clone().setName(key));

		return materials.get(key);
	};

	const groups = new Map(PARTS.map((p) => [p, []]));

	for (const { prim, comps } of sources) {
		const indices = prim.getIndices().getArray();
		const byPart = new Map();

		for (const c of comps) {
			const list = byPart.get(c.part) ?? [];

			for (const t of c.triangles) list.push(t);

			byPart.set(c.part, list);
		}

		for (const [part, list] of byPart) {
			list.sort((a, b) => a - b);

			const array = new Uint32Array(list.length * 3);

			list.forEach((t, k) => {
				array[k * 3] = indices[t * 3];
				array[k * 3 + 1] = indices[t * 3 + 1];
				array[k * 3 + 2] = indices[t * 3 + 2];
			});

			const next = doc
				.createPrimitive()
				.setIndices(
					doc
						.createAccessor()
						.setType("SCALAR")
						.setArray(array)
						.setBuffer(buffer),
				)
				.setMaterial(material(part, prim.getMaterial()));

			for (const semantic of prim.listSemantics())
				next.setAttribute(semantic, prim.getAttribute(semantic));

			functions.compactPrimitive(next);
			groups.get(part).push(next);
		}
	}

	const boomAxis = rotate([0, 0, 1]);
	const units = RTG_CUTS.concat([null]).map(() => []);

	for (const prim of groups.get("rtg"))
		slice(doc, buffer, prim, boomAxis, RTG_CUTS).forEach((next, k) => {
			if (next.getIndices().getCount()) units[k].push(next);
		});

	for (const prim of groups.get("rtg")) prim.dispose();

	groups.set("rtg", units.flat());

	for (const node of root.listNodes()) node.dispose();

	for (const mesh of root.listMeshes()) mesh.dispose();

	for (const scene of root.listScenes()) scene.dispose();

	const find = (part) =>
		all.filter((c) => c.part === part).map((c) => rotate(c.centroid));
	const mean = (list) => mul(list.reduce(add, [0, 0, 0]), 1 / list.length);

	const magBase = rotate(
		all
			.filter((c) => c.part === "mag" && c.max[1] < 2.4)
			.reduce((a, b) => (b.area > a.area ? b : a)).centroid,
	);

	const magTip = vertices(groups.get("mag")).reduce((a, b) =>
		length(sub(b, magBase)) > length(sub(a, magBase)) ? b : a,
	);

	const pws = all
		.filter((c) => c.part === "pws")
		.map((c) => {
			const near = [0, 1, 2].map((d) =>
				Math.abs(c.min[d]) < Math.abs(c.max[d]) ? c.min[d] : c.max[d],
			);

			const far = [0, 1, 2].map((d) =>
				Math.abs(c.min[d]) < Math.abs(c.max[d]) ? c.max[d] : c.min[d],
			);

			return {
				root: round(rotate(near)),
				tip: round(rotate(far)),
				length: Number(length(sub(far, near)).toFixed(2)),
				...heading(sub(rotate(far), rotate(near))),
			};
		});

	const science = rotate([scanCenter[0], 0, scanCenter[2]]);
	const rtgCenter = mean(find("rtg"));
	const record = mean(find("record"));

	const scene = doc.createScene();
	const model = doc.createNode("voyager");

	scene.addChild(model);

	const holder = (name, prims) => {
		const mesh = doc.createMesh(name);

		for (const prim of prims) mesh.addPrimitive(prim);

		return doc.createNode(`${name}-mesh`).setMesh(mesh);
	};

	const report = {};

	for (const part of PARTS) {
		const prims = groups.get(part);

		const extras = {
			part,
			anchor: round(surface(prims, rotate(TARGETS[part]))),
			explode: round(rotate(EXPLODE[part])),
			...bounds(prims),
			triangles: triangles(prims),
		};

		const node = doc.createNode(part);

		if (part === "rtg") {
			extras.units = units.map((list, k) => {
				const name = `rtg-${k + 1}`;

				const info = {
					unit: k + 1,
					spread: round(rotate(mul(RTG_SPREAD, k))),
					...bounds(list),
				};

				node.addChild(
					doc.createNode(name).setExtras(info).addChild(holder(name, list)),
				);

				return { name, ...info };
			});
		} else {
			node.addChild(holder(part, prims));
		}

		model.addChild(node.setExtras(extras));
		report[part] = extras;
	}

	const directions = {
		science: heading(science),
		rtg: heading([rtgCenter[0], 0, rtgCenter[2]]),
		mag: {
			root: round(magBase),
			tip: round(magTip),
			length: Number(length(sub(magTip, magBase)).toFixed(2)),
			...heading(sub(magTip, magBase)),
		},
		pws,
		record: heading([record[0], 0, record[2]]),
	};

	model.setExtras({
		units: "m",
		up: "+Y is the high-gain antenna boresight",
		source: /^https?:/.test(source) ? source : basename(source),
		credit: "NASA/JPL-Caltech",
		dish: DISH,
		scale: Number(scale.toFixed(5)),
		directions,
	});

	await doc.transform(
		functions.prune({ keepExtras: true }),
		functions.dedup({
			propertyTypes: [core.PropertyType.ACCESSOR, core.PropertyType.TEXTURE],
		}),
		functions.textureCompress({
			encoder: sharp,
			targetFormat: "webp",
			slots: /^(?!normalTexture).*$/,
			quality: 95,
			effort: 100,
		}),
		functions.textureCompress({
			encoder: sharp,
			targetFormat: "webp",
			slots: /^normalTexture$/,
			quality: 95,
			effort: 100,
		}),
		functions.reorder({ encoder: MeshoptEncoder, target: "size" }),
		functions.quantize({
			quantizationVolume: "mesh",
			quantizePosition: 14,
			quantizeNormal: 10,
			quantizeTexcoord: 12,
		}),
	);

	doc
		.createExtension(extensions.EXTMeshoptCompression)
		.setRequired(true)
		.setEncoderOptions({
			method: extensions.EXTMeshoptCompression.EncoderMethod.QUANTIZE,
		});

	mkdirSync(dirname(output), { recursive: true });
	await io.write(output, doc);

	return { output, bytes: statSync(output).size, directions, parts: report };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const result = await build(process.argv[2] ?? SOURCE, OUTPUT);

	console.log(JSON.stringify(result, null, 2));
}
