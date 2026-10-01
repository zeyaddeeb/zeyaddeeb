import {
	BoxGeometry,
	type BufferGeometry,
	CircleGeometry,
	CylinderGeometry,
	Group,
	LatheGeometry,
	Matrix4,
	Mesh,
	type Object3D,
	Quaternion,
	TorusGeometry,
	Vector2,
	Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PartId } from "./model";
import type { Finish, Library } from "./stage-materials";

export type V3 = [number, number, number];

export interface Piece {
	part: PartId;
	object: Object3D;
	offset: Vector3;
	base?: Vector3;
}

export interface Built {
	pieces: Piece[];
	anchors: Map<PartId, { at: Vector3; piece: number }>;
}

const BUS_R = 0.936;
const BUS_H = 0.47;
const APOTHEM = BUS_R * Math.cos(Math.PI / 10);
const DISH_R = 1.83;
const DISH_DEPTH = 0.52;
const DISH_Y = BUS_H / 2 + 0.22;
const FOCUS = (DISH_R * DISH_R) / (4 * DISH_DEPTH);
const TILE = 0.45;

const dishY = (r: number) => DISH_Y + (r * r) / (4 * FOCUS);

const v = (a: V3) => new Vector3(a[0], a[1], a[2]);
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const unit = (a: V3): V3 => {
	const l = Math.hypot(a[0], a[1], a[2]) || 1;

	return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];
const flat = (deg: number): V3 => {
	const r = (deg * Math.PI) / 180;

	return [Math.cos(r), 0, Math.sin(r)];
};

function basis(axis: V3): [V3, V3] {
	const helper: V3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
	const u = unit(cross(axis, helper));
	const w = unit(cross(axis, u));

	return [u, w];
}

export const SCIENCE: V3 = flat(-8);
export const RTG: V3 = flat(172);
const MAG: V3 = unit([
	Math.cos(Math.PI * 0.955) * 0.94,
	0.34,
	Math.sin(Math.PI * 0.955) * 0.94,
]);
const RECORD_ANGLE = 72;

const UP = new Vector3(0, 1, 0);

function orient(geo: BufferGeometry, base: V3, axis: V3, length: number) {
	const dir = v(axis).normalize();
	const q = new Quaternion().setFromUnitVectors(UP, dir);

	const m = new Matrix4().compose(
		v(base).addScaledVector(dir, length / 2),
		q,
		new Vector3(1, 1, 1),
	);

	geo.applyMatrix4(m);

	return geo;
}

function scaleUv(geo: BufferGeometry, su: number, sv: number) {
	const uv = geo.getAttribute("uv");

	if (!uv) return geo;

	for (let i = 0; i < uv.count; i++)
		uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);

	uv.needsUpdate = true;

	return geo;
}

class Kit {
	groups: { part: PartId; offset: Vector3 }[] = [];
	bins = new Map<
		string,
		{ group: number; finish: Finish; geos: BufferGeometry[] }
	>();
	anchors = new Map<PartId, { at: Vector3; piece: number }>();
	current = 0;

	begin(part: PartId, offset: V3 = [0, 0, 0]) {
		this.groups.push({ part, offset: v(offset) });
		this.current = this.groups.length - 1;
	}

	anchor(part: PartId, at: V3) {
		this.anchors.set(part, { at: v(at), piece: this.current });
	}

	add(finish: Finish, geo: BufferGeometry) {
		const indexed = geo.index ? 1 : 0;
		const key = `${this.current}:${finish}:${indexed}`;
		let bin = this.bins.get(key);

		if (!bin) {
			bin = { group: this.current, finish, geos: [] };
			this.bins.set(key, bin);
		}

		bin.geos.push(geo);
	}

	rod(a: V3, b: V3, r: number, finish: Finish = "aluminum", seg = 8) {
		const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const len = Math.hypot(d[0], d[1], d[2]);

		if (len < 1e-5) return;

		this.add(
			finish,
			orient(new CylinderGeometry(r, r, len, seg, 1, true), a, d, len),
		);
	}

	can(
		base: V3,
		axis: V3,
		length: number,
		r0: number,
		r1: number,
		finish: Finish,
		seg = 24,
		open = false,
	) {
		const geo = new CylinderGeometry(r1, r0, length, seg, 1, open);

		scaleUv(geo, (Math.PI * 2 * Math.max(r0, r1)) / TILE, length / TILE);
		this.add(finish, orient(geo, base, axis, length));
	}

	box(
		center: V3,
		size: V3,
		finish: Finish,
		x: V3 = [1, 0, 0],
		y: V3 = [0, 1, 0],
	) {
		const geo = new BoxGeometry(size[0], size[1], size[2]);
		const s = Math.max(size[0], size[1], size[2]) / TILE;

		scaleUv(geo, s, s);

		const xa = v(unit(x));
		const ya = v(unit(y));
		const za = new Vector3().crossVectors(xa, ya).normalize();
		const m = new Matrix4().makeBasis(xa, ya, za).setPosition(v(center));

		geo.applyMatrix4(m);
		this.add(finish, geo);
	}

	disc(center: V3, normal: V3, radius: number, finish: Finish, seg = 32) {
		const geo = new CircleGeometry(radius, seg);

		const q = new Quaternion().setFromUnitVectors(
			new Vector3(0, 0, 1),
			v(normal).normalize(),
		);

		geo.applyMatrix4(new Matrix4().compose(v(center), q, new Vector3(1, 1, 1)));
		this.add(finish, geo);
	}

	build(lib: Library): Piece[] {
		const pieces: Piece[] = this.groups.map((g) => ({
			part: g.part,
			object: new Group(),
			offset: g.offset,
		}));

		for (const bin of this.bins.values()) {
			const geo =
				bin.geos.length === 1 ? bin.geos[0] : mergeGeometries(bin.geos, false);

			if (!geo) continue;

			if (bin.geos.length > 1) for (const g of bin.geos) g.dispose();

			geo.computeBoundingSphere();

			const mesh = new Mesh(geo, lib.finish(bin.finish));

			mesh.castShadow = true;
			mesh.receiveShadow = true;
			pieces[bin.group].object.add(mesh);
		}

		return pieces;
	}
}

function bus(k: Kit) {
	const body = new CylinderGeometry(BUS_R, BUS_R, BUS_H, 10, 1, false);

	scaleUv(body, (Math.PI * 2 * BUS_R) / TILE, BUS_H / TILE);

	const faceted = body.toNonIndexed();

	body.dispose();
	faceted.computeVertexNormals();
	k.add("kapton", faceted);

	const skirt = new CylinderGeometry(1.02, 0.9, 0.36, 64, 1, true);

	scaleUv(skirt, (Math.PI * 2 * 1.02) / TILE, 0.36 / TILE);
	skirt.translate(0, BUS_H / 2 + 0.18, 0);
	k.add("kapton", skirt);

	for (let i = 0; i < 10; i++) {
		const a = i * 36;
		const out = flat(a);

		if (a === RECORD_ANGLE) continue;

		const side = unit(cross([0, 1, 0], out));
		const face = mul(out, APOTHEM);

		if (i % 3 === 1) {
			const center = add(face, mul(out, 0.012));

			k.box(center, [0.46, 0.32, 0.018], "silver", side, [0, 1, 0]);

			for (let s = 0; s < 9; s++) {
				const along = -0.18 + s * 0.045;

				k.box(
					add(add(center, mul(side, along)), mul(out, 0.018)),
					[0.03, 0.28, 0.012],
					"aluminum",
					side,
					[0, 1, 0],
				);
			}
		} else if (i % 3 === 2) {
			k.box(
				add(face, mul(out, 0.01)),
				[0.5, 0.36, 0.016],
				"gold",
				side,
				[0, 1, 0],
			);
		} else {
			k.box(
				add(add(face, mul(out, 0.008)), [0, -0.06, 0]),
				[0.34, 0.16, 0.014],
				"aluminum",
				side,
				[0, 1, 0],
			);
		}
	}

	k.can([0, -BUS_H / 2, 0], [0, -1, 0], 0.2, 0.44, 0.36, "gold", 40);
	k.can([0, -BUS_H / 2 - 0.2, 0], [0, -1, 0], 0.05, 0.3, 0.3, "aluminum", 32);
	k.anchor("bus", [BUS_R * 0.75, -0.08, BUS_R * 0.62]);
}

function dish(k: Kit) {
	const steps = 32;
	const inner = 0.17;
	const front: Vector2[] = [];
	const back: Vector2[] = [];

	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const r = inner + (DISH_R - inner) * t ** 0.85;

		front.push(new Vector2(r, dishY(r)));
		back.push(new Vector2(r, dishY(r) - 0.028));
	}

	front.reverse();
	k.add("dish", new LatheGeometry(front, 128));
	k.add("dishBack", new LatheGeometry(back, 128));

	const rim = new TorusGeometry(DISH_R, 0.016, 10, 160);

	rim.rotateX(Math.PI / 2);
	rim.translate(0, dishY(DISH_R) - 0.013, 0);
	k.add("white", rim);
	k.can([0, DISH_Y - 0.03, 0], [0, 1, 0], 0.12, 0.2, 0.19, "white", 40);
	k.can([0, DISH_Y + 0.08, 0], [0, 1, 0], 0.46, 0.15, 0.065, "white", 32);
	k.can([0, DISH_Y + 0.54, 0], [0, 1, 0], 0.05, 0.075, 0.06, "aluminum", 24);

	const sub = DISH_Y + FOCUS * 0.86;
	const cap: Vector2[] = [];

	for (let i = 0; i <= 10; i++) {
		const r = 0.3 * (i / 10);

		cap.push(new Vector2(Math.max(r, 0.001), sub - (r * r) / 1.4));
	}

	k.add("white", new LatheGeometry(cap, 64));
	k.can([0, sub, 0], [0, 1, 0], 0.035, 0.3, 0.29, "white", 64);
	k.can([0, sub + 0.035, 0], [0, 1, 0], 0.16, 0.09, 0.07, "strut", 24);
	k.can([0, sub + 0.195, 0], [0, 1, 0], 0.03, 0.12, 0.12, "aluminum", 24);

	for (let s = 0; s < 4; s++) {
		const a = (s / 4) * Math.PI * 2 + Math.PI / 4;
		const foot: V3 = [Math.cos(a) * 1.12, dishY(1.12), Math.sin(a) * 1.12];
		const head: V3 = [Math.cos(a) * 0.25, sub - 0.01, Math.sin(a) * 0.25];

		k.rod(foot, head, 0.014, "strut", 8);
		k.box(foot, [0.06, 0.03, 0.06], "strut");
	}

	k.anchor("hga", [DISH_R * 0.66, dishY(DISH_R * 0.72) + 0.02, DISH_R * 0.38]);
}

function record(k: Kit) {
	const out = flat(RECORD_ANGLE);

	k.begin("record", mul(out, 1.1));

	const center = mul(out, APOTHEM + 0.014);

	k.can(mul(out, APOTHEM), out, 0.014, 0.172, 0.172, "recordEdge", 64);
	k.disc(add(center, mul(out, 0.0005)), out, 0.155, "record", 96);

	const ring = new TorusGeometry(0.163, 0.007, 8, 96);
	const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), v(out));

	ring.applyMatrix4(
		new Matrix4().compose(
			v(add(center, mul(out, 0.002))),
			q,
			new Vector3(1, 1, 1),
		),
	);

	k.add("recordEdge", ring);
	k.disc(add(center, mul(out, 0.004)), out, 0.022, "recordEdge", 24);
	k.anchor("record", add(center, mul(out, 0.03)));
}

function rtgs(k: Kit) {
	k.begin("boom");

	const [u, w] = basis(RTG);
	const root = add(mul(RTG, APOTHEM), [0, -0.04, 0]);
	const tip = add(mul(RTG, 3.9), [0, -0.1, 0]);

	const rails = [-1, 1].map((s) => ({
		a: add(root, mul(u, s * 0.16)),
		b: add(tip, mul(u, s * 0.06)),
	}));

	for (const r of rails) k.rod(r.a, r.b, 0.018, "aluminum", 10);

	const brace = 10;

	for (let i = 0; i < brace; i++) {
		const t0 = i / brace;
		const t1 = (i + 1) / brace;

		const lerp = (r: { a: V3; b: V3 }, t: number): V3 => [
			r.a[0] + (r.b[0] - r.a[0]) * t,
			r.a[1] + (r.b[1] - r.a[1]) * t,
			r.a[2] + (r.b[2] - r.a[2]) * t,
		];

		k.rod(
			lerp(rails[i % 2], t0),
			lerp(rails[(i + 1) % 2], t1),
			0.008,
			"aluminum",
			6,
		);
	}

	k.rod(
		add(root, mul(w, 0.1)),
		add(mul(RTG, 2.1), [0, -0.1, 0]),
		0.012,
		"aluminum",
		8,
	);

	for (let n = 0; n < 3; n++) {
		const along = 2.1 + n * 0.62;

		k.begin("rtg", mul(RTG, 0.45 + n * 0.5));

		const base = add(mul(RTG, along), [0, -0.1, 0]);
		const len = 0.508;

		k.can(base, RTG, len, 0.12, 0.12, "rtg", 32);
		k.can(add(base, mul(RTG, -0.02)), RTG, 0.03, 0.2, 0.2, "aluminum", 40);
		k.can(add(base, mul(RTG, len - 0.01)), RTG, 0.03, 0.2, 0.2, "aluminum", 40);

		for (let f = 0; f < 6; f++) {
			const ang = (f / 6) * Math.PI * 2 + Math.PI / 12;
			const radial = add(mul(u, Math.cos(ang)), mul(w, Math.sin(ang)));
			const center = add(add(base, mul(RTG, len / 2)), mul(radial, 0.162));

			k.box(center, [0.09, len - 0.04, 0.01], "fin", radial, RTG);
		}

		if (n === 1)
			k.anchor("rtg", add(add(base, mul(RTG, len / 2)), [0, 0.22, 0]));
	}
}

function science(k: Kit) {
	k.begin("boom");

	const [u] = basis(SCIENCE);
	const root = add(mul(SCIENCE, APOTHEM), [0, 0.12, 0]);
	const tip = add(mul(SCIENCE, 3.25), [0, 0.3, 0]);

	const low = [-1, 1].map((s) => ({
		a: add(root, mul(u, s * 0.14)),
		b: add(tip, mul(u, s * 0.05)),
	}));

	const high = { a: add(root, [0, 0.2, 0]), b: add(tip, [0, 0.12, 0]) };

	for (const r of [...low, high]) k.rod(r.a, r.b, 0.02, "aluminum", 10);

	const rails = [low[0], high, low[1]];
	const bays = 9;

	for (let i = 0; i < bays; i++) {
		const t0 = i / bays;
		const t1 = (i + 1) / bays;

		const at = (r: { a: V3; b: V3 }, t: number): V3 => [
			r.a[0] + (r.b[0] - r.a[0]) * t,
			r.a[1] + (r.b[1] - r.a[1]) * t,
			r.a[2] + (r.b[2] - r.a[2]) * t,
		];

		for (let j = 0; j < 3; j++) {
			k.rod(at(rails[j], t0), at(rails[(j + 1) % 3], t0), 0.007, "aluminum", 6);
			k.rod(at(rails[j], t0), at(rails[(j + 1) % 3], t1), 0.006, "aluminum", 6);
		}
	}

	k.begin("crs", add(mul(SCIENCE, 0.4), [0, 0.45, 0]));

	const crs = add(mul(SCIENCE, 2.1), [0, 0.62, 0]);

	k.box(crs, [0.3, 0.22, 0.24], "gold", SCIENCE, [0, 1, 0]);

	for (const dz of [-0.06, 0.06]) {
		k.can(
			add(crs, [0, 0.11, dz]),
			[0, 1, 0],
			0.09,
			0.045,
			0.045,
			"aluminum",
			20,
		);

		k.disc(add(crs, [0, 0.201, dz]), [0, 1, 0], 0.036, "lens", 20);
	}

	k.anchor("crs", add(crs, [0, 0.2, 0]));

	k.begin("lecp", add(mul(SCIENCE, 0.7), [0, 0.3, 0]));

	const lecp = add(mul(SCIENCE, 2.45), [0, 0.18, 0]);

	k.can(add(lecp, [0, -0.12, 0]), [0, 1, 0], 0.24, 0.1, 0.1, "kapton", 28);
	k.can(add(lecp, [0, 0.12, 0]), [0, 1, 0], 0.06, 0.17, 0.17, "gold", 40);
	k.can(add(lecp, [0, 0.18, 0]), [0, 1, 0], 0.03, 0.08, 0.06, "aluminum", 24);
	k.anchor("lecp", add(lecp, [0, 0.24, 0]));

	k.begin("pls", add(mul(SCIENCE, 0.3), [0, 0.6, 0]));

	const pls = add(mul(SCIENCE, 2.8), [0, 0.62, 0]);

	k.box(pls, [0.22, 0.14, 0.22], "kapton");

	for (let c = 0; c < 3; c++) {
		const a = (c / 3) * Math.PI * 2;
		const tilt = unit([Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35]);
		const at = add(pls, add([0, 0.06, 0], mul(tilt, 0.02)));

		k.can(at, tilt, 0.12, 0.035, 0.075, "aluminum", 24, true);
		k.disc(add(at, mul(tilt, 0.03)), tilt, 0.045, "lens", 20);
	}

	k.anchor("pls", add(pls, [0, 0.2, 0]));

	k.begin("scan", add(mul(SCIENCE, 1.1), [0, 0.45, 0]));

	const scan = add(mul(SCIENCE, 3.45), [0, 0.22, 0]);
	const look = unit([SCIENCE[0] * 0.2, -0.35, SCIENCE[2] * 0.2 - 1]);
	const side = unit(cross(look, [0, 1, 0]));

	k.box(scan, [0.46, 0.34, 0.4], "kapton", side, [0, 1, 0]);

	const camera = (at: V3, r: number, len: number, finish: Finish) => {
		k.can(at, look, len, r, r, finish, 28);

		k.can(
			add(at, mul(look, len - 0.02)),
			look,
			0.04,
			r * 1.12,
			r * 1.12,
			"strut",
			28,
		);

		k.disc(add(at, mul(look, len + 0.021)), look, r * 0.8, "lens", 28);
	};

	camera(add(scan, add(mul(side, -0.12), [0, 0.1, 0])), 0.09, 0.95, "white");
	camera(add(scan, add(mul(side, 0.1), [0, 0.12, 0])), 0.06, 0.5, "white");
	camera(add(scan, add(mul(side, 0.02), [0, -0.12, 0])), 0.2, 0.42, "aluminum");

	k.box(
		add(scan, add(mul(side, 0.3), [0, 0.05, 0])),
		[0.14, 0.18, 0.3],
		"gold",
		side,
		[0, 1, 0],
	);

	camera(add(scan, add(mul(side, 0.3), [0, -0.12, 0])), 0.07, 0.36, "aluminum");
	k.anchor("scan", add(scan, [0, 0.35, 0]));
}

function magnetometer(k: Kit) {
	k.begin("mag");

	const from = add(mul(flat(172 - 25), APOTHEM), [0, 0.2, 0]);

	k.box(from, [0.2, 0.2, 0.2], "gold");

	const length = 13;
	const radius = 0.12;
	const [u, w] = basis(MAG);

	const corner = (i: number): V3 => {
		const a = (i / 3) * Math.PI * 2;

		return add(mul(u, Math.cos(a) * radius), mul(w, Math.sin(a) * radius));
	};

	const at = (t: number, i: number) => add(add(from, mul(MAG, t)), corner(i));

	for (let i = 0; i < 3; i++)
		k.rod(at(0.1, i), at(length, i), 0.0065, "truss", 6);

	const bays = Math.round(length / 0.4);

	for (let b = 0; b <= bays; b++) {
		const t = 0.1 + (b / bays) * (length - 0.1);
		const t2 = 0.1 + (Math.min(b + 1, bays) / bays) * (length - 0.1);

		for (let i = 0; i < 3; i++) {
			k.rod(at(t, i), at(t, (i + 1) % 3), 0.0045, "truss", 5);

			if (b < bays) k.rod(at(t, i), at(t2, (i + 1) % 3), 0.0028, "truss", 4);
		}
	}

	k.can(add(from, mul(MAG, length)), MAG, 0.2, 0.075, 0.075, "white", 24);
	k.can(add(from, mul(MAG, 6.9)), MAG, 0.18, 0.075, 0.075, "white", 24);
	k.can(add(from, mul(MAG, 0.04)), MAG, 0.14, 0.16, 0.16, "kapton", 24);
	k.anchor("mag", add(add(from, mul(MAG, 2.8)), [0, 0.1, 0]));
}

function plasmaWave(k: Kit) {
	k.begin("pws");

	const root = add(mul(flat(172), APOTHEM * 0.55), [0, -BUS_H / 2 - 0.02, 0]);
	const a = unit([-0.35, -0.55, 0.652]);
	const c = unit([-0.35, -0.55, -0.652]);

	k.box(root, [0.12, 0.06, 0.12], "aluminum");
	k.rod(root, add(root, mul(a, 10)), 0.0085, "brass", 6);
	k.rod(root, add(root, mul(c, 10)), 0.0085, "brass", 6);
	k.anchor("pws", add(root, mul(a, 1.7)));
}

export function buildProcedural(lib: Library): Built {
	const k = new Kit();

	k.begin("bus");
	bus(k);
	k.begin("hga", [0, 1.35, 0]);
	dish(k);
	record(k);
	rtgs(k);
	science(k);
	magnetometer(k);
	plasmaWave(k);

	return { pieces: k.build(lib), anchors: k.anchors };
}
