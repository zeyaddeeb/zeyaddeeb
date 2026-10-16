import type { Form } from "./forms";

export interface Ray {
	origin: { x: number; y: number; z: number };
	direction: { x: number; y: number; z: number };
}

const STRIDE = 0.01;

export function hit(form: Form, ray: Ray): [number, number, number] | null {
	const { origin: o, direction: d } = ray;
	const R = form.radius * 1.05;
	const b = o.x * d.x + o.y * d.y + o.z * d.z;
	const c = o.x * o.x + o.y * o.y + o.z * o.z - R * R;
	const disc = b * b - c;

	if (disc < 0) return null;

	const t0 = -b - Math.sqrt(disc);
	const t1 = -b + Math.sqrt(disc);
	const at = (t: number) =>
		form.value(o.x + t * d.x, o.y + t * d.y, o.z + t * d.z);
	let prev = at(t0);

	for (let t = t0 + STRIDE; t <= t1 + STRIDE; t += STRIDE) {
		const now = at(t);

		if (Math.sign(now) !== Math.sign(prev)) {
			let lo = t - STRIDE;
			let hi = t;
			const sign = Math.sign(prev);

			for (let i = 0; i < 40; i++) {
				const mid = (lo + hi) / 2;

				if (Math.sign(at(mid)) === sign) lo = mid;
				else hi = mid;
			}

			const s = (lo + hi) / 2;
			const p: [number, number, number] = [
				o.x + s * d.x,
				o.y + s * d.y,
				o.z + s * d.z,
			];

			if (form.rim(p[0], p[1], p[2]) > 0) return p;
		}

		prev = now;
	}

	return null;
}
