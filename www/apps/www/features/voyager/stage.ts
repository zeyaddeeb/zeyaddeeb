import {
	Box3,
	BufferAttribute,
	BufferGeometry,
	CircleGeometry,
	Color,
	CylinderGeometry,
	DirectionalLight,
	DoubleSide,
	Group,
	type Material,
	Matrix4,
	Mesh,
	type MeshPhysicalMaterial,
	MeshStandardMaterial,
	NeutralToneMapping,
	type Object3D,
	PCFShadowMap,
	PerspectiveCamera,
	PlaneGeometry,
	PointLight,
	Scene,
	SRGBColorSpace,
	type Texture,
	TextureLoader,
	TorusGeometry,
	Vector2,
	Vector3,
	WebGLRenderer,
} from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
	type GLTF,
	GLTFLoader,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import type { PartId } from "./model";
import { buildProcedural, type Piece, SCIENCE } from "./stage-geometry";
import {
	createLook,
	createShade,
	dress,
	type Finish,
	Library,
	type Look,
	upgrade,
	ZONED,
	zoned,
	zoneOf,
} from "./stage-materials";
import { createStudio } from "./stage-studio";

export interface View {
	yaw: number;
	pitch: number;
	scale: number;
	cx: number;
	cy: number;
	explode: number;
	focus: PartId | null;
	off: ReadonlySet<PartId> | ReadonlyMap<PartId, number>;
	heat: number;
	fold?: number;
	stow?: number;
	grow?: Partial<Record<PartId, number>>;
}

export interface StageOptions {
	shadow?: number;
	url?: string;
	signal?: AbortSignal;
	ao?: boolean;
}

export interface Stage {
	readonly source: "model" | "procedural";
	draw(view: View): void;
	project(point: readonly number[], view: View): [number, number, number];
	anchor(part: PartId, view: View): [number, number, number];
	resize(width: number, height: number, dpr: number): void;
	dispose(): void;
}

type Lit = MeshStandardMaterial | MeshPhysicalMaterial;

const PARTS: readonly PartId[] = [
	"hga",
	"bus",
	"rtg",
	"mag",
	"pws",
	"scan",
	"crs",
	"lecp",
	"pls",
	"record",
	"boom",
];

type Triple = readonly [number, number, number];

const SHORT_FOV = 21;
const EXPOSURE = 1;
const ENVIRONMENT = 0.9;
const SUN_DISTANCE = 30;
const SUN_SIDE: Triple = [-0.78, 0.5, 0.42];
const SUN_FRONT: Triple = [-0.35, 0.35, 0.87];
const GLOW = new Color(1, 0.38, 0.13);
const DARK = new Color(0, 0, 0);
const WHIP_ANCHOR = 0.35;
const UP = new Vector3(0, 1, 0);
const SWING: Partial<Record<PartId, number>> = { record: 2.15 };
const SWUNG_BY = 0.6;
const STOW = 0.8;
const STOW_FROM = 0.5;
const RECORD_SEGMENTS = 96;
const AO = {
	radius: 0.55,
	distanceExponent: 1.4,
	thickness: 0.4,
	scale: 1.4,
	samples: 16,
	distanceFallOff: 1,
	screenSpaceRadius: false,
};
const AO_DENOISE = {
	lumaPhi: 10,
	depthPhi: 2,
	normalPhi: 3,
	radius: 6,
	rings: 2,
	samples: 16,
};
const LIP_INSET = 0.004;
const LIP_TUBE = 0.02;
const LIP_DROP = 0.004;
const FOLD: Partial<Record<PartId, Triple>> = {
	hga: [0, 1.6, 0],
	rtg: [-0.1, -0.75, 0.02],
	scan: [-0.25, -0.9, 0.05],
	crs: [0, 1.02, 0],
	pls: [0.3, 1.5, -0.04],
	lecp: [0.3, 1.55, 0.02],
};

const smooth = (t: number) => {
	const c = Math.min(1, Math.max(0, t));

	return c * c * (3 - 2 * c);
};

const amountOf = (
	off: ReadonlySet<PartId> | ReadonlyMap<PartId, number>,
	part: PartId,
) =>
	"get" in off
		? Math.min(1, Math.max(0, off.get(part) ?? 0))
		: off.has(part)
			? 1
			: 0;

const isPart = (s: unknown): s is PartId =>
	typeof s === "string" && (PARTS as readonly string[]).includes(s);

const vec = (a: unknown): Vector3 | null =>
	Array.isArray(a) &&
	a.length === 3 &&
	a.every((n) => typeof n === "number" && Number.isFinite(n))
		? new Vector3(a[0], a[1], a[2])
		: null;

let fetched: { url: string; data: Promise<ArrayBuffer | null> } | null = null;

const pause = () => new Promise<void>((done) => setTimeout(done, 0));

function fetchModel(url: string) {
	if (!fetched || fetched.url !== url) {
		fetched = {
			url,
			data: fetch(url)
				.then(async (r) => {
					if (!r.ok) return null;

					const buf = await r.arrayBuffer();
					const magic = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));

					return String.fromCharCode(...magic) === "glTF" ? buf : null;
				})
				.catch(() => null),
		};
	}

	return fetched.data;
}

async function parse(data: ArrayBuffer): Promise<GLTF | null> {
	const loader = new GLTFLoader();

	loader.setMeshoptDecoder(MeshoptDecoder);

	loader.register((parser) => {
		parser.textureLoader = new TextureLoader(parser.options.manager);

		return { name: "vg_image_textures" };
	});

	try {
		return await loader.parseAsync(data, "");
	} catch {
		return null;
	}
}

function directions(root: Object3D): Record<string, unknown> | null {
	let found: Record<string, unknown> | null = null;

	root.traverse((o) => {
		const d = o.userData?.directions;

		if (!found && d && typeof d === "object") found = d;
	});

	return found;
}

function tagOf(node: Object3D, names: boolean): PartId | null {
	const tagged = node.userData?.part;

	if (isPart(tagged)) return tagged;

	if (!names) return null;

	const prefix = node.name.split(/[_.\s-]/)[0]?.toLowerCase();

	return isPart(prefix) ? prefix : null;
}

function owner(mesh: Object3D, root: Object3D): [Object3D, PartId] {
	for (const names of [false, true]) {
		let n: Object3D | null = mesh;

		while (n && n !== root) {
			const tag = tagOf(n, names);

			if (tag) return [n, tag];

			n = n.parent;
		}
	}

	return [mesh, "bus"];
}

function textures(material: Material, into: Set<Texture>) {
	for (const value of Object.values(material)) {
		if (value && (value as Texture).isTexture) into.add(value as Texture);
	}
}

function zones(mesh: Mesh, part: PartId): (Finish | null)[] | null {
	const geo = mesh.geometry;
	const uv = geo.getAttribute("uv");
	const index = geo.index;

	if (!uv || !index || !ZONED.has(part)) return null;

	const buckets = new Map<Finish | null, number[]>();

	for (let t = 0; t < index.count; t += 3) {
		const a = index.getX(t);
		const b = index.getX(t + 1);
		const c = index.getX(t + 2);
		const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3;
		const v = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
		const finish = zoneOf(part, u, v);
		const list = buckets.get(finish) ?? [];

		list.push(a, b, c);
		buckets.set(finish, list);
	}

	if (buckets.size === 1 && buckets.has(null)) return null;

	const order = [...buckets.keys()];
	const all = new Uint32Array(index.count);
	let at = 0;

	geo.clearGroups();

	order.forEach((finish, k) => {
		const list = buckets.get(finish) ?? [];

		all.set(list, at);
		geo.addGroup(at, list.length, k);
		at += list.length;
	});

	geo.setIndex(new BufferAttribute(all, 1));

	return order;
}

function rest(mesh: Mesh, frame: Object3D) {
	const geo = mesh.geometry;

	if (geo.getAttribute("vgRest")) return;

	mesh.updateWorldMatrix(true, false);

	const toFrame = new Matrix4()
		.copy(frame.matrixWorld)
		.invert()
		.multiply(mesh.matrixWorld);

	const pos = geo.getAttribute("position");
	const out = new Float32Array(pos.count * 3);
	const p = new Vector3();

	for (let i = 0; i < pos.count; i++) {
		p.fromBufferAttribute(pos, i).applyMatrix4(toFrame);
		out[i * 3] = p.x;
		out[i * 3 + 1] = p.y;
		out[i * 3 + 2] = p.z;
	}

	geo.setAttribute("vgRest", new BufferAttribute(out, 3));
}

interface Rim {
	center: Vector3;
	radius: number;
}

interface Spot {
	at: Vector3[];
	object: Object3D;
}

interface Assembly {
	pieces: Piece[];
	anchors: Map<PartId, Spot>;
	sources: Material[];
	textures: Set<Texture>;
	turn: number;
	rim: Rim | null;
	sleeve: Object3D | null;
}

function firstMesh(node: Object3D): Mesh | null {
	let found: Mesh | null = null;

	node.traverse((o) => {
		if (!found && (o as Mesh).isMesh) found = o as Mesh;
	});

	return found;
}

function fit(rows: number[][], values: number[]): [number, number, number] {
	const a = [0, 0, 0, 0, 0, 0, 0, 0, 0];
	const b = [0, 0, 0];

	rows.forEach((r, k) => {
		for (let i = 0; i < 3; i++) {
			b[i] += r[i] * values[k];

			for (let j = 0; j < 3; j++) a[i * 3 + j] += r[i] * r[j];
		}
	});

	const m = new Matrix4().set(
		a[0],
		a[1],
		a[2],
		0,
		a[3],
		a[4],
		a[5],
		0,
		a[6],
		a[7],
		a[8],
		0,
		0,
		0,
		0,
		1,
	);

	const x = new Vector3(b[0], b[1], b[2]).applyMatrix4(m.invert());

	return [x.x, x.y, x.z];
}

function recordDisc(node: Object3D) {
	const mesh = firstMesh(node);

	if (!mesh?.geometry.index) return;

	const geo = mesh.geometry;
	const pos = geo.getAttribute("position");
	const uv = geo.getAttribute("uv");
	const index = geo.index;

	if (!uv || !index) return;

	const world = (i: number) =>
		new Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
	const areas = new Map<string, { n: Vector3; area: number }>();
	const tris: { ids: number[]; n: Vector3 }[] = [];

	for (let t = 0; t < index.count; t += 3) {
		const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
		const [a, b, c] = ids.map(world);
		const cross = b.clone().sub(a).cross(c.clone().sub(a));
		const area = cross.length() / 2;

		if (area < 1e-9) continue;

		const n = cross.normalize();

		tris.push({ ids, n });

		const key = n
			.toArray()
			.map((v) => v.toFixed(1))
			.join();

		const bin = areas.get(key) ?? { n: new Vector3(), area: 0 };

		bin.n.addScaledVector(n, area);
		bin.area += area;
		areas.set(key, bin);
	}

	let best: { n: Vector3; area: number } | null = null;

	for (const bin of areas.values())
		if (!best || bin.area > best.area) best = bin;

	if (!best) return;

	const normal = best.n.clone().normalize();
	const face = new Set<number>();

	for (const t of tris)
		if (t.n.dot(normal) > 0.98) for (const i of t.ids) face.add(i);

	if (face.size < 8) return;

	const up = UP.clone().addScaledVector(normal, -normal.dot(UP));

	if (up.lengthSq() < 1e-6) return;

	const e2 = up.normalize();
	const e1 = new Vector3().crossVectors(e2, normal).normalize();
	const origin = world([...face][0]);

	const flat = [...face].map((i) => {
		const d = world(i).sub(origin);

		return { i, x: d.dot(e1), y: d.dot(e2), z: d.dot(normal) };
	});

	const xs = flat.map((f) => f.x);
	const ys = flat.map((f) => f.y);
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
	const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	const cz = flat.reduce((acc, f) => acc + f.z, 0) / flat.length;
	let radius = 0;

	for (const f of flat)
		radius = Math.max(radius, Math.hypot(f.x - cx, f.y - cy));

	if (radius < 0.02) return;

	const rows = flat.map((f) => [1, f.x - cx, f.y - cy]);

	const fu = fit(
		rows,
		flat.map((f) => uv.getX(f.i)),
	);

	const fv = fit(
		rows,
		flat.map((f) => uv.getY(f.i)),
	);

	const center = origin
		.clone()
		.addScaledVector(e1, cx)
		.addScaledVector(e2, cy)
		.addScaledVector(normal, cz);

	const toLocal = new Matrix4().copy(mesh.matrixWorld).invert();

	const place = (g: BufferGeometry, lift = 0) =>
		g
			.applyMatrix4(
				new Matrix4()
					.makeBasis(e1, e2, normal)
					.setPosition(center.clone().addScaledVector(normal, lift)),
			)
			.applyMatrix4(toLocal);

	const disc = new CircleGeometry(radius, RECORD_SEGMENTS);
	const dp = disc.getAttribute("position");
	const atlas = new Float32Array(dp.count * 2);
	const local = new Float32Array(dp.count * 2);

	for (let i = 0; i < dp.count; i++) {
		const x = dp.getX(i);
		const y = dp.getY(i);

		atlas[i * 2] = fu[0] + fu[1] * x + fu[2] * y;
		atlas[i * 2 + 1] = fv[0] + fv[1] * x + fv[2] * y;
		local[i * 2] = 0.5 + x / (2 * radius);
		local[i * 2 + 1] = 0.5 + y / (2 * radius);
	}

	disc.setAttribute("uv", new BufferAttribute(atlas, 2));
	disc.setAttribute("uv1", new BufferAttribute(local, 2));
	mesh.geometry = place(disc);

	let depth = 0;

	for (const t of tris)
		if (Math.abs(t.n.dot(normal)) < 0.3)
			for (const i of t.ids)
				depth = Math.max(depth, cz - world(i).sub(origin).dot(normal));

	depth = Math.min(0.03, Math.max(0.006, depth));

	const trim = new MeshStandardMaterial({ name: "record.rim" });

	const band = new CylinderGeometry(
		radius,
		radius,
		depth,
		RECORD_SEGMENTS,
		1,
		true,
	);

	band.rotateX(Math.PI / 2);

	const rim = new TorusGeometry(radius + 0.001, 0.003, 8, RECORD_SEGMENTS);

	mesh.add(new Mesh(place(band, -depth / 2), trim), new Mesh(place(rim), trim));
}

function sleeve(
	node: Object3D,
	holder: Object3D,
	from: Vector3,
	to: Vector3,
): Mesh | null {
	const mesh = firstMesh(node);
	const geo = mesh?.geometry;
	const index = geo?.index;

	if (!mesh || !geo || !index) return null;

	const pos = geo.getAttribute("position");
	const axis = to.clone().sub(from).normalize();
	const keep: number[] = [];
	const moved: number[] = [];
	const c = new Vector3();
	const p = new Vector3();

	for (let t = 0; t < index.count; t += 3) {
		c.set(0, 0, 0);

		for (let k = 0; k < 3; k++)
			c.add(
				p
					.fromBufferAttribute(pos, index.getX(t + k))
					.applyMatrix4(mesh.matrixWorld),
			);

		c.divideScalar(3);

		const list = c.sub(from).dot(axis) > STOW_FROM ? moved : keep;

		list.push(index.getX(t), index.getX(t + 1), index.getX(t + 2));
	}

	if (moved.length === 0 || keep.length === 0) return null;

	const split = (list: number[]) => {
		const g = new BufferGeometry();

		for (const [name, attr] of Object.entries(geo.attributes))
			g.setAttribute(name, attr);

		g.setIndex(list);

		return g;
	};

	mesh.geometry = split(keep);

	const boom = new Mesh(split(moved), mesh.material);

	mesh.add(boom);

	const cuff = new Group();

	cuff.position.copy(from).addScaledVector(axis, STOW_FROM);
	cuff.quaternion.setFromUnitVectors(UP, axis);
	holder.add(cuff);
	holder.updateMatrixWorld(true);
	cuff.attach(boom);

	return boom;
}

function dishRim(root: Object3D): Rim | null {
	const points: Vector3[] = [];

	root.traverse((o) => {
		const mesh = o as Mesh;

		if (!mesh.isMesh) return;

		const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		const name = list[0]?.name.toLowerCase() ?? "";

		if (!name.includes("dish") || name.includes("back")) return;

		const pos = mesh.geometry.getAttribute("position");

		for (let i = 0; i < pos.count; i++) {
			points.push(
				new Vector3()
					.fromBufferAttribute(pos, i)
					.applyMatrix4(mesh.matrixWorld),
			);
		}
	});

	if (points.length < 16) return null;

	let far = 0;

	for (const p of points) far = Math.max(far, Math.hypot(p.x, p.z));

	const rim = points.filter((p) => Math.hypot(p.x, p.z) > far - 0.02);
	const center = new Vector3();

	for (const p of rim) center.add(p);

	center.divideScalar(rim.length);

	let radius = 0;

	for (const p of rim) radius += Math.hypot(p.x - center.x, p.z - center.z);

	radius /= rim.length;

	return radius > 1 ? { center, radius } : null;
}

function fromModel(gltf: GLTF): Assembly | null {
	const root = gltf.scene;

	root.updateMatrixWorld(true);

	const rim = dishRim(root);
	const byNode = new Map<Object3D, PartId>();

	root.traverse((o) => {
		if (!(o as Mesh).isMesh) return;

		const [node, part] = owner(o, root);

		byNode.set(node, part);
	});

	if (byNode.size === 0) return null;

	const box = new Box3();
	const partBox = new Map<PartId, Box3>();

	for (const [node, part] of byNode) {
		box.setFromObject(node);

		const b = partBox.get(part) ?? new Box3();

		b.union(box);
		partBox.set(part, b);
	}

	let turn = 0;
	const scan = partBox.get("scan");

	if (scan) {
		const c = scan.getCenter(new Vector3());
		const off = Math.atan2(c.z, c.x) - Math.atan2(SCIENCE[2], SCIENCE[0]);

		if (Math.hypot(c.x, c.z) > 0.5 && Math.abs(off) > 0.1) turn = off;
	}

	const up = new Vector3(0, 1, 0);

	const fallback = (part: PartId): Vector3 => {
		const b = partBox.get(part);

		if (!b) return new Vector3();

		const c = b.getCenter(new Vector3());
		const radial = new Vector3(c.x, 0, c.z);

		if (radial.lengthSq() > 1e-6) radial.normalize();

		switch (part) {
			case "hga":
				return up.clone().multiplyScalar(1.35);
			case "record":
				return radial.multiplyScalar(1.1);
			case "rtg":
				return radial.multiplyScalar(0.7);
			case "scan":
				return radial.multiplyScalar(1.1).addScaledVector(up, 0.45);
			case "crs":
				return radial.multiplyScalar(0.4).addScaledVector(up, 0.45);
			case "lecp":
				return radial.multiplyScalar(0.7).addScaledVector(up, 0.3);
			case "pls":
				return radial.multiplyScalar(0.3).addScaledVector(up, 0.6);
			default:
				return new Vector3();
		}
	};

	const pieces: Piece[] = [];
	const anchors = new Map<PartId, Spot>();
	const sources: Material[] = [];
	const found = new Set<Texture>();
	const dirs = directions(root);
	const magDir = dirs?.mag as { root?: unknown; tip?: unknown } | undefined;
	const magRoot = vec(magDir?.root);
	const magTip = vec(magDir?.tip);
	let boom: Mesh | null = null;

	for (const [node, part] of byNode) {
		const object = new Group();

		object.attach(node);

		if (part === "record") recordDisc(node);

		if (part === "mag" && magRoot && magTip && !boom)
			boom = sleeve(node, object, magRoot, magTip);

		pieces.push({
			part,
			object,
			offset: vec(node.userData?.explode) ?? fallback(part),
		});

		const units: Object3D[] = [];

		node.traverse((o) => {
			const spread = o === node ? null : vec(o.userData?.spread);

			if (spread) {
				units.push(o);

				pieces.push({
					part,
					object: o,
					offset: spread,
					base: o.position.clone(),
				});
			}

			const mesh = o as Mesh;

			if (!mesh.isMesh) return;

			mesh.castShadow = true;
			mesh.receiveShadow = true;

			const list = Array.isArray(mesh.material)
				? mesh.material
				: [mesh.material];

			for (const m of list) {
				if (!sources.includes(m)) {
					sources.push(m);
					textures(m, found);
				}
			}
		});

		const at = vec(node.userData?.anchor);

		if (!at || anchors.has(part)) continue;

		let holder: Object3D = object;

		if (
			part === "mag" &&
			boom &&
			magRoot &&
			magTip &&
			at.clone().sub(magRoot).dot(magTip.clone().sub(magRoot).normalize()) >
				STOW_FROM
		)
			holder = boom;

		let best = Number.POSITIVE_INFINITY;

		for (const u of units) {
			const c =
				vec(u.userData?.center) ??
				new Box3().setFromObject(u).getCenter(new Vector3());

			const d = c.distanceToSquared(at);

			if (d < best) {
				best = d;
				holder = u;
			}
		}

		anchors.set(part, { at: [at], object: holder });
	}

	const whips = dirs?.pws;
	const pws = anchors.get("pws");

	if (pws && Array.isArray(whips)) {
		for (const whip of whips) {
			const from = vec(whip?.root);
			const to = vec(whip?.tip);

			if (from && to) pws.at.push(from.lerp(to, WHIP_ANCHOR));
		}

		if (pws.at.length > 1) pws.at.shift();
	}

	for (const part of partBox.keys()) {
		if (anchors.has(part)) continue;

		const b = partBox.get(part);

		if (!b) continue;

		const target = b.getCenter(new Vector3());
		let best = Number.POSITIVE_INFINITY;
		let pick = target.clone();
		let holder: Object3D | null = null;
		const p = new Vector3();

		for (const piece of pieces) {
			if (piece.part !== part || piece.base) continue;

			piece.object.updateMatrixWorld(true);

			piece.object.traverse((o) => {
				const mesh = o as Mesh;

				if (!mesh.isMesh) return;

				const pos = mesh.geometry.getAttribute("position");
				const step = Math.max(1, Math.floor(pos.count / 4000));

				for (let k = 0; k < pos.count; k += step) {
					p.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);

					const d = p.distanceToSquared(target);

					if (d < best) {
						best = d;
						pick = p.clone();
						holder = piece.object;
					}
				}
			});
		}

		if (holder) anchors.set(part, { at: [pick], object: holder });
	}

	return {
		pieces,
		anchors,
		sources,
		textures: found,
		turn,
		rim,
		sleeve: boom ? (boom as Mesh).parent : null,
	};
}

function procedural(lib: Library): Assembly {
	const built = buildProcedural(lib);
	const anchors = new Map<PartId, Spot>();

	for (const [part, a] of built.anchors) {
		const piece = built.pieces[a.piece];

		if (piece) anchors.set(part, { at: [a.at], object: piece.object });
	}

	return {
		pieces: built.pieces,
		anchors,
		sources: [],
		textures: new Set<Texture>(),
		turn: 0,
		rim: null,
		sleeve: null,
	};
}

export async function createStage(
	canvas: HTMLCanvasElement,
	options: StageOptions = {},
): Promise<Stage> {
	const url = options.url ?? "/voyager/voyager.glb";
	const signal = options.signal;
	const data = await fetchModel(url);
	const gltf = data ? await parse(data) : null;

	if (signal?.aborted) throw new DOMException("Stage aborted", "AbortError");

	const renderer = new WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
	});

	renderer.setClearColor(0x000000, 0);
	renderer.outputColorSpace = SRGBColorSpace;
	renderer.toneMapping = NeutralToneMapping;
	renderer.toneMappingExposure = EXPOSURE;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = PCFShadowMap;
	renderer.shadowMap.autoUpdate = false;

	const early = (extra?: () => void) => {
		if (!signal?.aborted) return;

		extra?.();
		renderer.dispose();

		throw new DOMException("Stage aborted", "AbortError");
	};

	await pause();
	early();

	const scene = new Scene();
	const env = createStudio(renderer);

	await pause();
	early(() => env.dispose());
	scene.environment = env.texture;
	scene.environmentIntensity = ENVIRONMENT;

	const camera = new PerspectiveCamera(SHORT_FOV, 1, 0.1, 100);
	const pivot = new Group();
	const fix = new Group();

	pivot.add(fix);
	scene.add(pivot);

	const sun = new DirectionalLight(0xfff6ee, 4.2);

	sun.position
		.set(...SUN_SIDE)
		.normalize()
		.multiplyScalar(SUN_DISTANCE);

	sun.castShadow = true;

	const size = options.shadow ?? 2048;

	sun.shadow.mapSize.set(size, size);
	sun.shadow.radius = size >= 2048 ? 2.2 : 1.6;
	sun.shadow.blurSamples = 12;
	sun.shadow.bias = -0.0002;
	sun.shadow.normalBias = 0.012;
	scene.add(sun, sun.target);

	const fill = new DirectionalLight(0xb8c8ec, 0.6);

	fill.position.set(0.7, -0.35, 0.6).multiplyScalar(SUN_DISTANCE);

	const rim = new DirectionalLight(0xe6eeff, 4.5);

	rim.position.set(0.35, 0.4, -0.85).multiplyScalar(SUN_DISTANCE);

	const kick = new DirectionalLight(0xf4eee6, 1.6);

	kick.position.set(-0.8, -0.1, -0.6).multiplyScalar(SUN_DISTANCE);
	scene.add(fill, fill.target, rim, rim.target, kick, kick.target);

	const lib = new Library();
	let loaded: Assembly | null = null;

	try {
		loaded = gltf ? fromModel(gltf) : null;
	} catch {
		loaded = null;
	}

	const assembly: Assembly = loaded ?? procedural(lib);
	const source: Stage["source"] =
		assembly.sources.length > 0 ? "model" : "procedural";

	fix.rotation.y = assembly.turn;

	const sharp = Math.min(8, renderer.capabilities.getMaxAnisotropy());

	for (const t of assembly.textures) t.anisotropy = sharp;

	const shade = createShade();

	const occlusion =
		options.ao ??
		(typeof window !== "undefined" &&
			window.matchMedia?.("(pointer: fine)").matches === true);

	const gtao = occlusion ? new GTAOPass(scene, camera, 1, 1) : null;

	if (gtao) {
		gtao.output = GTAOPass.OUTPUT.Off;
		gtao.normalMaterial.side = DoubleSide;
		gtao.updateGtaoMaterial(AO);
		gtao.updatePdMaterial(AO_DENOISE);
		shade.ao.value = gtao.gtaoMap;
		shade.aoOn.value = 1;
	}

	const looks = new Map<PartId, Look>();
	const heated: Lit[] = [];
	const owned: Lit[] = [];
	const clones = new Map<string, Lit>();

	const lookFor = (part: PartId) => {
		const found = looks.get(part);

		if (found) return found;

		const look = createLook();

		looks.set(part, look);

		return look;
	};

	const materialFor = (
		part: PartId,
		src: Material,
		finish: Finish | null = null,
	): Lit => {
		const key = `${part}:${src.uuid}:${finish ?? ""}`;
		const cached = clones.get(key);

		if (cached) return cached;

		const made = finish
			? zoned(finish, src, lib, part)
			: source === "model"
				? upgrade(src, part, lib)
				: ((src as Lit).clone() as Lit);

		if (part === "rtg") {
			made.emissiveMap = null;
			made.userData.heat = made.map ? 0.3 : 0.16;
			heated.push(made);
		}

		made.envMap = env.texture;
		made.envMapIntensity *= ENVIRONMENT;
		dress(made, lookFor(part), shade);
		clones.set(key, made);
		owned.push(made);

		return made;
	};

	const pieces = assembly.pieces;
	const glow = new PointLight(0xff8a3d, 0, 2.2, 2);
	const rtgPiece = pieces.find((p) => p.part === "rtg");

	if (rtgPiece) {
		const b = new Box3().setFromObject(rtgPiece.object);

		glow.position.copy(b.getCenter(new Vector3())).add(new Vector3(0, 0.35, 0));
		rtgPiece.object.add(glow);
	} else {
		fix.add(glow);
	}

	for (const piece of pieces) if (!piece.base) fix.add(piece.object);

	fix.updateMatrixWorld(true);

	for (const piece of pieces) {
		if (piece.base) continue;

		piece.object.traverse((o) => {
			const mesh = o as Mesh;

			if (!mesh.isMesh) return;

			if (Array.isArray(mesh.material)) {
				mesh.material = mesh.material.map((m) => materialFor(piece.part, m));
			} else {
				const src = mesh.material;

				const split =
					source === "model" && (src as MeshStandardMaterial).map
						? zones(mesh, piece.part)
						: null;

				mesh.material = split
					? split.map((finish) => materialFor(piece.part, src, finish))
					: materialFor(piece.part, src);
			}

			const list = Array.isArray(mesh.material)
				? mesh.material
				: [mesh.material];

			if (list.some((m) => Number(m.userData.crinkle ?? 0) > 0))
				rest(mesh, fix);
		});
	}

	for (const m of assembly.sources) m.dispose();

	await pause();

	early(() => {
		for (const m of owned) m.dispose();

		lib.dispose();
		gtao?.dispose();
		env.dispose();
	});

	const dish = pieces.find((p) => p.part === "hga" && !p.base);

	if (assembly.rim && dish) {
		const lip = new TorusGeometry(
			assembly.rim.radius * Math.cos(Math.PI / 48) - LIP_INSET,
			LIP_TUBE,
			12,
			192,
		);

		lip.rotateX(Math.PI / 2);

		lip.translate(
			assembly.rim.center.x,
			assembly.rim.center.y - LIP_DROP,
			assembly.rim.center.z,
		);

		const paint = new MeshStandardMaterial({
			color: 0xe6e2da,
			roughness: 0.5,
			metalness: 0,
		});

		const edge = new Mesh(lip, materialFor("hga", paint));

		paint.dispose();
		edge.castShadow = true;
		edge.receiveShadow = true;
		dish.object.add(edge);
	}

	fix.updateMatrixWorld(true);

	const turned = new Vector3();
	const moved = new Vector3();

	const frames = new Map<
		Piece,
		{ angle: number; pivot: Vector3; fold: Vector3 }
	>();

	for (const piece of pieces) {
		if (piece.base) continue;

		const box = new Box3().setFromObject(piece.object);
		const folded = FOLD[piece.part];

		frames.set(piece, {
			angle: SWING[piece.part] ?? 0,
			pivot: box.isEmpty()
				? new Vector3()
				: fix.worldToLocal(box.getCenter(new Vector3())),
			fold: folded ? new Vector3(...folded) : piece.offset.clone(),
		});
	}

	const anchors = new Map<
		PartId,
		{ local: Vector3[]; object: Object3D; ring: number | null }
	>();

	for (const [part, a] of assembly.anchors) {
		const local = a.at.map((at) =>
			a.object.worldToLocal(fix.localToWorld(at.clone())),
		);

		const first = local[0];

		anchors.set(part, {
			local,
			object: a.object,
			ring: part === "bus" && first ? Math.hypot(first.x, first.z) : null,
		});
	}

	const core = new Box3();
	let reach = 0;
	let travel = 0;
	let spread = 0;
	const corner = new Vector3();

	for (const piece of pieces) {
		if (piece.base) spread = Math.max(spread, piece.offset.length());
		else
			travel = Math.max(
				travel,
				piece.offset.length(),
				frames.get(piece)?.fold.length() ?? 0,
			);

		if (piece.base || piece.part === "mag" || piece.part === "pws") continue;

		core.setFromObject(piece.object);

		if (core.isEmpty()) continue;

		for (let i = 0; i < 8; i++) {
			corner.set(
				i & 1 ? core.max.x : core.min.x,
				i & 2 ? core.max.y : core.min.y,
				i & 4 ? core.max.z : core.min.z,
			);

			reach = Math.max(reach, corner.length());
		}
	}

	const radius = Math.min(9, reach + travel + spread + 0.4);
	const shadowCam = sun.shadow.camera;

	shadowCam.left = -radius;
	shadowCam.right = radius;
	shadowCam.top = radius;
	shadowCam.bottom = -radius;
	shadowCam.near = SUN_DISTANCE - radius - 1;
	shadowCam.far = SUN_DISTANCE + radius + 14;
	shadowCam.updateProjectionMatrix();

	let width = 1;
	let height = 1;
	const point = new Vector3();
	const eye = new Vector3();
	const posed: number[] = [Number.NaN];
	const sunSide = new Vector3(...SUN_SIDE).normalize();
	const sunFront = new Vector3(...SUN_FRONT).normalize();

	const pose = (view: View) => {
		const key = [
			view.yaw,
			view.pitch,
			view.scale,
			view.cx,
			view.cy,
			view.explode,
			view.fold ?? 0,
			view.stow ?? 0,
			width,
			height,
			...PARTS.map((p) => view.grow?.[p] ?? 1),
		];

		if (key.length === posed.length && key.every((k, i) => k === posed[i]))
			return;

		posed.length = key.length;

		key.forEach((k, i) => {
			posed[i] = k;
		});

		renderer.shadowMap.needsUpdate = true;
		pivot.rotation.set(view.pitch, -view.yaw, 0, "XYZ");

		sun.position
			.copy(sunSide)
			.lerp(sunFront, smooth((view.pitch - 0.6) / 0.8))
			.normalize()
			.multiplyScalar(SUN_DISTANCE);

		const short = Math.min(width, height);
		const half = Math.tan(((SHORT_FOV / 2) * Math.PI) / 180);
		const vfov = 2 * Math.atan((half * height) / short);
		const distance =
			height / (2 * Math.tan(vfov / 2) * Math.max(1e-3, view.scale));

		camera.fov = (vfov * 180) / Math.PI;
		camera.aspect = width / height;
		camera.position.set(0, 0, distance);
		camera.near = Math.max(0.2, distance - 16);
		camera.far = distance + 18;

		camera.setViewOffset(
			width,
			height,
			width / 2 - view.cx,
			height / 2 - view.cy,
			width,
			height,
		);

		camera.updateProjectionMatrix();

		const fold = Math.min(1, Math.max(0, view.fold ?? 0));
		const swung = smooth(view.explode / SWUNG_BY);

		for (const piece of pieces) {
			const frame = frames.get(piece);

			if (!frame) {
				piece.object.position.set(0, 0, 0);

				if (piece.base) piece.object.position.add(piece.base);

				piece.object.position.addScaledVector(piece.offset, view.explode);

				continue;
			}

			moved.copy(piece.offset).lerp(frame.fold, fold);

			const angle = frame.angle * swung;
			const grow = Math.max(0.1, view.grow?.[piece.part] ?? 1);

			piece.object.rotation.y = angle;
			piece.object.scale.setScalar(grow);
			turned.copy(frame.pivot).applyAxisAngle(UP, angle).multiplyScalar(grow);

			piece.object.position
				.copy(frame.pivot)
				.sub(turned)
				.addScaledVector(moved, view.explode);
		}

		if (assembly.sleeve)
			assembly.sleeve.scale.y =
				1 - STOW * Math.min(1, Math.max(0, view.stow ?? 0));

		scene.updateMatrixWorld();
		camera.updateMatrixWorld();
	};

	const toScreen = (world: Vector3): [number, number, number] => {
		const depth = world.z;

		world.project(camera);

		return [((world.x + 1) / 2) * width, ((1 - world.y) / 2) * height, depth];
	};

	const project = (p: readonly number[], view: View) => {
		pose(view);
		point.set(p[0], p[1], p[2]).applyMatrix4(pivot.matrixWorld);

		return toScreen(point);
	};

	const anchor = (part: PartId, view: View) => {
		pose(view);

		const a = anchors.get(part);

		if (!a || a.local.length === 0) return toScreen(point.set(0, 0, 0));

		if (a.ring) {
			eye.copy(camera.position);
			a.object.worldToLocal(eye);

			const flat = Math.hypot(eye.x, eye.z) || 1;

			point
				.set((eye.x / flat) * a.ring, a.local[0].y, (eye.z / flat) * a.ring)
				.applyMatrix4(a.object.matrixWorld);

			return toScreen(point);
		}

		let best = Number.NEGATIVE_INFINITY;

		for (const l of a.local) {
			eye.copy(l).applyMatrix4(a.object.matrixWorld);

			if (eye.z > best) {
				best = eye.z;
				point.copy(eye);
			}
		}

		return toScreen(point);
	};

	const draw = (view: View) => {
		pose(view);

		for (const [part, look] of looks) {
			const focused = view.focus === part;

			look.ghost.value = amountOf(view.off, part);
			look.tint.value = focused ? 0.32 : 0;
			look.fade.value = view.focus && !focused ? 0.74 : 0;
		}

		const heat = Math.max(0, Math.min(1, view.heat));

		for (const m of heated) {
			m.emissive.copy(heat > 0 ? GLOW : DARK);
			m.emissiveIntensity = heat * Number(m.userData.heat ?? 0.2);
		}

		glow.intensity = heat * 2;

		if (gtao) {
			gtao.render(renderer, gtao.pdRenderTarget, gtao.pdRenderTarget, 0, false);
			renderer.setRenderTarget(null);
		}

		renderer.render(scene, camera);
	};

	const resize = (w: number, h: number, dpr: number) => {
		const nextWidth = Math.max(1, w);
		const nextHeight = Math.max(1, h);

		if (
			nextWidth === width &&
			nextHeight === height &&
			dpr === renderer.getPixelRatio()
		)
			return;

		width = nextWidth;
		height = nextHeight;
		posed[0] = Number.NaN;
		renderer.setPixelRatio(dpr);
		renderer.setSize(width, height, false);

		if (gtao) {
			const buffer = renderer.getDrawingBufferSize(new Vector2());

			gtao.setSize(
				Math.max(1, Math.round(buffer.x / 2)),
				Math.max(1, Math.round(buffer.y / 2)),
			);

			shade.aoTexel.value.set(1 / buffer.x, 1 / buffer.y);
		}
	};

	const dispose = () => {
		const geometries = new Set<BufferGeometry>();

		scene.traverse((o) => {
			const mesh = o as Mesh;

			if (mesh.isMesh) geometries.add(mesh.geometry);
		});

		for (const g of geometries) g.dispose();

		for (const m of owned) m.dispose();

		for (const t of assembly.textures) t.dispose();

		lib.dispose();
		sun.shadow.dispose();
		gtao?.dispose();
		env.dispose();
		scene.environment = null;
		renderer.renderLists.dispose();
		renderer.dispose();

		if (!canvas.isConnected) renderer.forceContextLoss();
	};

	const halt = () => {
		if (!signal?.aborted) return;

		dispose();

		throw new DOMException("Stage aborted", "AbortError");
	};

	await renderer.compileAsync(scene, camera).catch(() => {});
	halt();

	if (gtao) {
		const warm = new Scene();
		const plane = new PlaneGeometry(2, 2);

		warm.add(
			new Mesh(plane, gtao.normalMaterial),
			new Mesh(plane, gtao.gtaoMaterial),
			new Mesh(plane, gtao.pdMaterial),
		);

		renderer.setRenderTarget(gtao.gtaoRenderTarget);

		const ready = renderer.compileAsync(warm, camera, scene);

		renderer.setRenderTarget(null);
		await ready.catch(() => {});
		plane.dispose();
		halt();
	}

	const maps = new Set<Texture>(assembly.textures);

	for (const t of lib.textures) maps.add(t);

	for (const m of owned) textures(m, maps);

	await Promise.all(
		[...maps].map((t) => {
			const image = t.image as HTMLImageElement | null;

			return image && typeof image.decode === "function"
				? image.decode().catch(() => {})
				: null;
		}),
	);

	halt();

	for (const t of maps) {
		renderer.initTexture(t);
		await new Promise((r) => setTimeout(r, 0));
		halt();
	}

	return { source, draw, project, anchor, resize, dispose };
}
