import type { Form } from "./forms";
import type { Cut } from "./tailor";

export interface ClothMesh {
	draped: Float32Array;
	flat: Float32Array;
	normals: Float32Array;
	cloth: Float32Array;
	margins: Float32Array;
	index: Uint32Array;
	reach: number;
}

const LIFT = 0.006;

export function clothMesh(form: Form, cut: Cut): ClothMesh {
	const { net, keep, seam } = cut;
	const S = net.side;
	const C = S - 1;
	const h = net.step;
	const map = new Int32Array(S * S).fill(-1);
	let count = 0;
	let cells = 0;

	for (let c = 0; c < keep.length; c++) {
		if (!keep[c]) continue;

		cells++;

		const a = Math.floor(c / C);
		const b = c % C;
		const p = a * S + b;

		for (const q of [p, p + S, p + 1, p + S + 1])
			if (map[q] < 0) map[q] = count++;
	}

	const draped = new Float32Array(count * 3);
	const flat = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	const cloth = new Float32Array(count * 2);
	const margins = new Float32Array(count * 3);
	const index = new Uint32Array(cells * 6);
	const g = new Float64Array(3);
	const { pos } = net;
	let reach = 0;

	for (let q = 0; q < S * S; q++) {
		const v = map[q];

		if (v < 0) continue;

		const a = Math.floor(q / S);
		const b = q % S;
		const x = pos[q * 3];
		const y = pos[q * 3 + 1];
		const z = pos[q * 3 + 2];

		form.gradient(x, y, z, g);

		const len = Math.hypot(g[0], g[1], g[2]) || 1;
		const nx = g[0] / len;
		const ny = g[1] / len;
		const nz = g[2] / len;
		const u = (a - net.steps) * h;
		const w = (b - net.steps) * h;

		draped[v * 3] = x + nx * LIFT;
		draped[v * 3 + 1] = y + ny * LIFT;
		draped[v * 3 + 2] = z + nz * LIFT;
		normals[v * 3] = nx;
		normals[v * 3 + 1] = ny;
		normals[v * 3 + 2] = nz;
		flat[v * 3] = u;
		flat[v * 3 + 1] = w;
		cloth[v * 2] = u;
		cloth[v * 2 + 1] = w;
		margins[v * 3] = Math.min(seam[q], 4 * h);
		margins[v * 3 + 1] = Math.min(net.jam[q], 0.25);
		margins[v * 3 + 2] = net.rim[q];
		reach = Math.max(reach, Math.hypot(u, w));
	}

	let i = 0;

	for (let c = 0; c < keep.length; c++) {
		if (!keep[c]) continue;

		const a = Math.floor(c / C);
		const b = c % C;
		const p = a * S + b;
		const v00 = map[p];
		const v10 = map[p + S];
		const v01 = map[p + 1];
		const v11 = map[p + S + 1];

		index[i++] = v00;
		index[i++] = v10;
		index[i++] = v11;
		index[i++] = v00;
		index[i++] = v11;
		index[i++] = v01;
	}

	return { draped, flat, normals, cloth, margins, index, reach };
}
