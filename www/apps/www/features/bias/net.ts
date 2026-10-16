import type { Form } from "./forms";

export interface Net {
	steps: number;
	side: number;
	step: number;
	fill: number;
	pin: [number, number, number];
	warp: [number, number, number];
	pos: Float64Array;
	has: Uint8Array;
	cos: Float32Array;
	jam: Float32Array;
	rim: Float32Array;
}

export interface Press {
	pin: [number, number, number];
	warp: [number, number, number];
}

const BAND = 0.22;
const FLOOR = 0.035;
const ITERATIONS = 12;

const grad = new Float64Array(3);
const solved = new Float64Array(3);

function solve3(
	a0: number,
	a1: number,
	a2: number,
	b0: number,
	b1: number,
	b2: number,
	c0: number,
	c1: number,
	c2: number,
	r0: number,
	r1: number,
	r2: number,
) {
	const m0 = b1 * c2 - b2 * c1;
	const m1 = b2 * c0 - b0 * c2;
	const m2 = b0 * c1 - b1 * c0;
	const det = a0 * m0 + a1 * m1 + a2 * m2;

	if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return false;

	solved[0] =
		(r0 * m0 + a1 * (r2 * b2 - r1 * c2) + a2 * (r1 * c1 - r2 * b1)) / det;
	solved[1] =
		(a0 * (r1 * c2 - r2 * b2) + r0 * m1 + a2 * (r2 * b0 - r1 * c0)) / det;
	solved[2] =
		(a0 * (r2 * b1 - r1 * c1) + a1 * (r1 * c0 - r2 * b0) + r0 * m2) / det;

	return true;
}

export function compass(
	form: Form,
	ax: number,
	ay: number,
	az: number,
	bx: number,
	by: number,
	bz: number,
	gx: number,
	gy: number,
	gz: number,
	h: number,
	out: Float64Array,
	o: number,
) {
	let x = gx;
	let y = gy;
	let z = gz;
	const hh = h * h;

	for (let it = 0; it < ITERATIONS; it++) {
		form.gradient(x, y, z, grad);

		const f = form.value(x, y, z);
		const pax = x - ax;
		const pay = y - ay;
		const paz = z - az;
		const pbx = x - bx;
		const pby = y - by;
		const pbz = z - bz;
		const fa = pax * pax + pay * pay + paz * paz - hh;
		const fb = pbx * pbx + pby * pby + pbz * pbz - hh;

		if (
			!solve3(
				grad[0],
				grad[1],
				grad[2],
				2 * pax,
				2 * pay,
				2 * paz,
				2 * pbx,
				2 * pby,
				2 * pbz,
				-f,
				-fa,
				-fb,
			)
		)
			return false;

		x += solved[0];
		y += solved[1];
		z += solved[2];

		const moved =
			solved[0] * solved[0] + solved[1] * solved[1] + solved[2] * solved[2];

		if (moved < hh * 1e-20) break;

		if (it === ITERATIONS - 1 && moved > hh * 1e-12) return false;
	}

	if (!Number.isFinite(x + y + z)) return false;

	out[o] = x;
	out[o + 1] = y;
	out[o + 2] = z;

	return true;
}

export function geodesicStep(
	form: Form,
	px: number,
	py: number,
	pz: number,
	tx: number,
	ty: number,
	tz: number,
	h: number,
	out: Float64Array,
	o: number,
) {
	form.gradient(px, py, pz, grad);

	let nx = grad[0];
	let ny = grad[1];
	let nz = grad[2];
	const nl = Math.hypot(nx, ny, nz);

	nx /= nl;
	ny /= nl;
	nz /= nl;

	const tn = tx * nx + ty * ny + tz * nz;
	let dx = tx - tn * nx;
	let dy = ty - tn * ny;
	let dz = tz - tn * nz;
	const dl = Math.hypot(dx, dy, dz);

	dx /= dl;
	dy /= dl;
	dz /= dl;

	let bx = ny * dz - nz * dy;
	let by = nz * dx - nx * dz;
	let bz = nx * dy - ny * dx;
	const bl = Math.hypot(bx, by, bz);

	bx /= bl;
	by /= bl;
	bz /= bl;

	let x = px + h * dx;
	let y = py + h * dy;
	let z = pz + h * dz;
	const hh = h * h;

	for (let it = 0; it < ITERATIONS; it++) {
		form.gradient(x, y, z, grad);

		const f = form.value(x, y, z);
		const qx = x - px;
		const qy = y - py;
		const qz = z - pz;
		const fr = qx * qx + qy * qy + qz * qz - hh;
		const fp = qx * bx + qy * by + qz * bz;

		if (
			!solve3(
				grad[0],
				grad[1],
				grad[2],
				2 * qx,
				2 * qy,
				2 * qz,
				bx,
				by,
				bz,
				-f,
				-fr,
				-fp,
			)
		)
			return false;

		x += solved[0];
		y += solved[1];
		z += solved[2];

		if (
			solved[0] * solved[0] + solved[1] * solved[1] + solved[2] * solved[2] <
			hh * 1e-20
		)
			break;
	}

	if (!Number.isFinite(x + y + z)) return false;

	out[o] = x;
	out[o + 1] = y;
	out[o + 2] = z;

	return true;
}

export function tangentFrame(form: Form, p: readonly number[]) {
	form.gradient(p[0], p[1], p[2], grad);

	const nl = Math.hypot(grad[0], grad[1], grad[2]);
	const n = [grad[0] / nl, grad[1] / nl, grad[2] / nl];
	const up = Math.abs(n[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1];
	const k = up[0] * n[0] + up[1] * n[1] + up[2] * n[2];
	const e = [up[0] - k * n[0], up[1] - k * n[1], up[2] - k * n[2]];
	const el = Math.hypot(e[0], e[1], e[2]);

	e[0] /= el;
	e[1] /= el;
	e[2] /= el;

	const f = [
		n[1] * e[2] - n[2] * e[1],
		n[2] * e[0] - n[0] * e[2],
		n[0] * e[1] - n[1] * e[0],
	];

	return { n, e, f };
}

export function grainAt(
	form: Form,
	p: readonly number[],
	angle: number,
): [number, number, number] {
	const { e, f } = tangentFrame(form, p);
	const c = Math.cos(angle);
	const s = Math.sin(angle);

	return [c * e[0] + s * f[0], c * e[1] + s * f[1], c * e[2] + s * f[2]];
}

export function weave(
	form: Form,
	press: Press,
	h: number,
	fill: number,
	steps = Math.ceil(form.reach / h),
): Net {
	const N = steps;
	const S = 2 * N + 1;
	const pos = new Float64Array(S * S * 3);
	const has = new Uint8Array(S * S);
	const [px, py, pz] = press.pin;

	form.gradient(px, py, pz, grad);

	const nl = Math.hypot(grad[0], grad[1], grad[2]);
	const nx = grad[0] / nl;
	const ny = grad[1] / nl;
	const nz = grad[2] / nl;
	const [wx0, wy0, wz0] = press.warp;
	const wn = wx0 * nx + wy0 * ny + wz0 * nz;
	let wx = wx0 - wn * nx;
	let wy = wy0 - wn * ny;
	let wz = wz0 - wn * nz;
	const wl = Math.hypot(wx, wy, wz);

	wx /= wl;
	wy /= wl;
	wz /= wl;

	const vx = ny * wz - nz * wy;
	const vy = nz * wx - nx * wz;
	const vz = nx * wy - ny * wx;
	const centre = N * S + N;
	const floor = Math.max(fill - BAND, FLOOR);
	const edge = -2 * h;

	pos[centre * 3] = px;
	pos[centre * 3 + 1] = py;
	pos[centre * 3 + 2] = pz;
	has[centre] = 1;

	const seed = (dx: number, dy: number, dz: number, da: number, db: number) => {
		let tx = dx;
		let ty = dy;
		let tz = dz;
		let prev = centre;

		for (let k = 1; k <= N; k++) {
			const at = (N + da * k) * S + (N + db * k);
			const p = prev * 3;

			if (
				!geodesicStep(
					form,
					pos[p],
					pos[p + 1],
					pos[p + 2],
					tx,
					ty,
					tz,
					h,
					pos,
					at * 3,
				)
			)
				return;

			const q = at * 3;

			if (form.rim(pos[q], pos[q + 1], pos[q + 2]) < edge) return;

			tx = (pos[q] - pos[p]) / h;
			ty = (pos[q + 1] - pos[p + 1]) / h;
			tz = (pos[q + 2] - pos[p + 2]) / h;
			has[at] = 1;
			prev = at;
		}
	};

	seed(wx, wy, wz, 1, 0);
	seed(-wx, -wy, -wz, -1, 0);
	seed(vx, vy, vz, 0, 1);
	seed(-vx, -vy, -vz, 0, -1);

	for (const sa of [1, -1]) {
		for (const sb of [1, -1]) {
			for (let i = 1; i <= N; i++) {
				for (let j = 1; j <= N; j++) {
					const a = N + sa * i;
					const b = N + sb * j;
					const at = a * S + b;
					const d = a * S + (b - sb);
					const l = (a - sa) * S + b;
					const c = (a - sa) * S + (b - sb);

					if (!has[d] || !has[l] || !has[c]) continue;

					const c3 = c * 3;
					const d3 = d * 3;
					const l3 = l * 3;
					const e1x = pos[d3] - pos[c3];
					const e1y = pos[d3 + 1] - pos[c3 + 1];
					const e1z = pos[d3 + 2] - pos[c3 + 2];
					const e2x = pos[l3] - pos[c3];
					const e2y = pos[l3 + 1] - pos[c3 + 1];
					const e2z = pos[l3 + 2] - pos[c3 + 2];
					const cx = e1y * e2z - e1z * e2y;
					const cy = e1z * e2x - e1x * e2z;
					const cz = e1x * e2y - e1y * e2x;
					const sin =
						Math.hypot(cx, cy, cz) /
						Math.sqrt(
							(e1x * e1x + e1y * e1y + e1z * e1z) *
								(e2x * e2x + e2y * e2y + e2z * e2z),
						);

					if (!(sin > floor)) continue;

					if (
						!compass(
							form,
							pos[d3],
							pos[d3 + 1],
							pos[d3 + 2],
							pos[l3],
							pos[l3 + 1],
							pos[l3 + 2],
							pos[d3] + pos[l3] - pos[c3],
							pos[d3 + 1] + pos[l3 + 1] - pos[c3 + 1],
							pos[d3 + 2] + pos[l3 + 2] - pos[c3 + 2],
							h,
							pos,
							at * 3,
						)
					)
						continue;

					const x3 = at * 3;
					const far =
						(pos[x3] - pos[c3]) * (e1x + e2x) +
						(pos[x3 + 1] - pos[c3 + 1]) * (e1y + e2y) +
						(pos[x3 + 2] - pos[c3 + 2]) * (e1z + e2z);

					if (far <= 0) continue;

					if (form.rim(pos[x3], pos[x3 + 1], pos[x3 + 2]) < edge) continue;

					has[at] = 1;
				}
			}
		}
	}

	const cos = new Float32Array(S * S);
	const jam = new Float32Array(S * S);
	const rim = new Float32Array(S * S);

	for (let a = 0; a < S; a++) {
		for (let b = 0; b < S; b++) {
			const at = a * S + b;

			if (!has[at]) continue;

			const a0 = a > 0 && has[at - S] ? at - S : at;
			const a1 = a < S - 1 && has[at + S] ? at + S : at;
			const b0 = b > 0 && has[at - 1] ? at - 1 : at;
			const b1 = b < S - 1 && has[at + 1] ? at + 1 : at;

			if (a0 === a1 || b0 === b1) {
				cos[at] = 0;
				jam[at] = -1;
				rim[at] = -1;
				continue;
			}

			const ux = pos[a1 * 3] - pos[a0 * 3];
			const uy = pos[a1 * 3 + 1] - pos[a0 * 3 + 1];
			const uz = pos[a1 * 3 + 2] - pos[a0 * 3 + 2];
			const qx = pos[b1 * 3] - pos[b0 * 3];
			const qy = pos[b1 * 3 + 1] - pos[b0 * 3 + 1];
			const qz = pos[b1 * 3 + 2] - pos[b0 * 3 + 2];
			const k =
				(ux * qx + uy * qy + uz * qz) /
				Math.sqrt(
					(ux * ux + uy * uy + uz * uz) * (qx * qx + qy * qy + qz * qz),
				);

			cos[at] = k;
			jam[at] = Math.sqrt(Math.max(0, 1 - k * k)) - fill;
			rim[at] = Math.min(
				1,
				form.rim(pos[at * 3], pos[at * 3 + 1], pos[at * 3 + 2]) / h,
			);
		}
	}

	return {
		steps: N,
		side: S,
		step: h,
		fill,
		pin: [px, py, pz],
		warp: [wx, wy, wz],
		pos,
		has,
		cos,
		jam,
		rim,
	};
}

export function clothAt(net: Net, a: number, b: number) {
	return [(a - net.steps) * net.step, (b - net.steps) * net.step] as const;
}
