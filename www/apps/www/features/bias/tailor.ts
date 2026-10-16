import type { Form } from "./forms";
import type { Net } from "./net";

export interface Cut {
	net: Net;
	seam: Float32Array;
	keep: Uint8Array;
	cells: number;
	cloth: number;
	covered: number;
	bounds: [number, number, number, number];
}

export interface Fit {
	cuts: Cut[];
	coverage: number;
	missed: number[];
	cloth: number;
}

const OPEN = 1e3;
const TABLE = 1 << 17;
const SAME = 1.6;
const LEAN = 1;
const ALLOWANCE = 2;

const NEIGHBORS = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

const paths = new WeakMap<Net, Float32Array>();

export function pathOf(net: Net) {
	const cached = paths.get(net);

	if (cached) return cached;

	const S = net.side;
	const C = S - 1;
	const N = net.steps;
	const live = new Uint8Array(S * S);

	for (let c = 0; c < C * C; c++) {
		if (!alive(net, c)) continue;

		const p = corner(net, c);

		live[p] = live[p + 1] = live[p + S] = live[p + S + 1] = 1;
	}

	const path = new Float32Array(S * S).fill(OPEN);
	const done = new Uint8Array(S * S);
	const heap = new Heap();
	const centre = N * S + N;

	path[centre] = 0;
	heap.push(0, centre);

	while (heap.size > 0) {
		const key = heap.keys[0];
		const p = heap.pop();

		if (done[p]) continue;

		done[p] = 1;

		const a = Math.floor(p / S);
		const b = p % S;

		for (const [da, db] of NEIGHBORS) {
			const na = a + da;
			const nb = b + db;

			if (na < 0 || nb < 0 || na >= S || nb >= S) continue;

			const q = na * S + nb;

			if (done[q] || !live[q]) continue;

			const lean = (Math.abs(net.cos[p]) + Math.abs(net.cos[q])) / 2;
			const e = key + net.step * Math.hypot(da, db) * (1 + LEAN * lean);

			if (e < path[q]) {
				path[q] = e;
				heap.push(e, q);
			}
		}
	}

	paths.set(net, path);

	return path;
}

interface Index {
	start: Int32Array;
	entries: Int32Array;
	centres: Float32Array;
	owners: Int32Array;
	cellsOf: Int32Array;
	size: number;
	only: Int32Array;
	box: Float32Array;
}

const hashOf = (ix: number, iy: number, iz: number) =>
	((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & (TABLE - 1);

function alive(net: Net, cell: number) {
	const S = net.side;
	const a = Math.floor(cell / (S - 1));
	const b = cell % (S - 1);
	const p = a * S + b;
	const { has, jam, rim } = net;

	if (!has[p] || !has[p + S] || !has[p + 1] || !has[p + S + 1]) return false;

	return (
		Math.max(jam[p], jam[p + S], jam[p + 1], jam[p + S + 1]) > 0 &&
		Math.max(rim[p], rim[p + S], rim[p + 1], rim[p + S + 1]) > 0
	);
}

function corner(net: Net, cell: number) {
	const S = net.side;
	const a = Math.floor(cell / (S - 1));
	const b = cell % (S - 1);

	return a * S + b;
}

function build(
	nets: Net[],
	usable: (Uint8Array | null)[],
	size: number,
): Index {
	let count = 0;

	for (let k = 0; k < nets.length; k++) {
		const cells = (nets[k].side - 1) ** 2;
		const use = usable[k];

		for (let c = 0; c < cells; c++)
			if (use ? use[c] : alive(nets[k], c)) count++;
	}

	const centres = new Float32Array(count * 3);
	const owners = new Int32Array(count);
	const cellsOf = new Int32Array(count);
	const keys = new Int32Array(count);
	const start = new Int32Array(TABLE + 1);
	let n = 0;

	for (let k = 0; k < nets.length; k++) {
		const net = nets[k];
		const S = net.side;
		const cells = (S - 1) ** 2;
		const use = usable[k];
		const { pos } = net;

		for (let c = 0; c < cells; c++) {
			if (!(use ? use[c] : alive(net, c))) continue;

			const p = corner(net, c);
			const q = p + S + 1;
			const x = (pos[p * 3] + pos[q * 3]) / 2;
			const y = (pos[p * 3 + 1] + pos[q * 3 + 1]) / 2;
			const z = (pos[p * 3 + 2] + pos[q * 3 + 2]) / 2;

			centres[n * 3] = x;
			centres[n * 3 + 1] = y;
			centres[n * 3 + 2] = z;
			owners[n] = k;
			cellsOf[n] = c;
			keys[n] = hashOf(
				Math.floor(x / size),
				Math.floor(y / size),
				Math.floor(z / size),
			);
			start[keys[n] + 1]++;
			n++;
		}
	}

	for (let i = 0; i < TABLE; i++) start[i + 1] += start[i];

	const fillAt = start.slice(0, TABLE);
	const entries = new Int32Array(count);

	for (let i = 0; i < count; i++) entries[fillAt[keys[i]]++] = i;

	const only = new Int32Array(TABLE).fill(-1);
	const box = new Float32Array(TABLE * 4);

	for (let key = 0; key < TABLE; key++) {
		const from = start[key];
		const to = start[key + 1];

		if (from === to) continue;

		let owner = owners[entries[from]];
		let minU = Number.POSITIVE_INFINITY;
		let maxU = Number.NEGATIVE_INFINITY;
		let minV = Number.POSITIVE_INFINITY;
		let maxV = Number.NEGATIVE_INFINITY;

		for (let e = from; e < to; e++) {
			const id = entries[e];
			const net = nets[owners[id]];
			const S = net.side;
			const cell = cellsOf[id];
			const u = Math.floor(cell / (S - 1)) - net.steps;
			const v = (cell % (S - 1)) - net.steps;

			if (owners[id] !== owner) owner = -2;

			minU = Math.min(minU, u);
			maxU = Math.max(maxU, u);
			minV = Math.min(minV, v);
			maxV = Math.max(maxV, v);
		}

		only[key] = owner;
		box[key * 4] = minU;
		box[key * 4 + 1] = maxU;
		box[key * 4 + 2] = minV;
		box[key * 4 + 3] = maxV;
	}

	return { start, entries, centres, owners, cellsOf, size, only, box };
}

const local = new Float64Array(3);

function locate(
	net: Net,
	cell: number,
	x: number,
	y: number,
	z: number,
): boolean {
	const S = net.side;
	const p = corner(net, cell);
	const { pos } = net;
	const ox = pos[p * 3];
	const oy = pos[p * 3 + 1];
	const oz = pos[p * 3 + 2];
	const ux = pos[(p + S) * 3] - ox;
	const uy = pos[(p + S) * 3 + 1] - oy;
	const uz = pos[(p + S) * 3 + 2] - oz;
	const vx = pos[(p + 1) * 3] - ox;
	const vy = pos[(p + 1) * 3 + 1] - oy;
	const vz = pos[(p + 1) * 3 + 2] - oz;
	const rx = x - ox;
	const ry = y - oy;
	const rz = z - oz;
	const uu = ux * ux + uy * uy + uz * uz;
	const uv = ux * vx + uy * vy + uz * vz;
	const vv = vx * vx + vy * vy + vz * vz;
	const ru = rx * ux + ry * uy + rz * uz;
	const rv = rx * vx + ry * vy + rz * vz;
	const det = uu * vv - uv * uv;

	if (det <= 0) return false;

	let s = (ru * vv - rv * uv) / det;
	let t = (rv * uu - ru * uv) / det;
	const wx = pos[(p + S + 1) * 3] - ox - ux - vx;
	const wy = pos[(p + S + 1) * 3 + 1] - oy - uy - vy;
	const wz = pos[(p + S + 1) * 3 + 2] - oz - uz - vz;
	const ex = rx - s * ux - t * vx - s * t * wx;
	const ey = ry - s * uy - t * vy - s * t * wy;
	const ez = rz - s * uz - t * vz - s * t * wz;
	const fu = ex * ux + ey * uy + ez * uz;
	const fv = ex * vx + ey * vy + ez * vz;

	s += (fu * vv - fv * uv) / det;
	t += (fv * uu - fu * uv) / det;

	const dx = rx - s * ux - t * vx - s * t * wx;
	const dy = ry - s * uy - t * vy - s * t * wy;
	const dz = rz - s * uz - t * vz - s * t * wz;
	const off = dx * dx + dy * dy + dz * dz;

	if (off > 0.09 * uu) return false;

	local[0] = s;
	local[1] = t;
	local[2] = off;

	return s >= -0.01 && s <= 1.01 && t >= -0.01 && t <= 1.01;
}

const lerp4 = (f: Float32Array, p: number, S: number, s: number, t: number) =>
	(1 - s) * (1 - t) * f[p] +
	s * (1 - t) * f[p + S] +
	(1 - s) * t * f[p + 1] +
	s * t * f[p + S + 1];

function reachOf(
	index: Index,
	nets: Net[],
	seams: (Float32Array | null)[],
	x: number,
	y: number,
	z: number,
	skip: number,
	su: number,
	sv: number,
	visit: (owner: number, distance: number, sine: number, cut: number) => void,
) {
	const { size, start, entries, centres, owners, cellsOf, only, box } = index;
	const gx = Math.floor(x / size - 0.5);
	const gy = Math.floor(y / size - 0.5);
	const gz = Math.floor(z / size - 0.5);
	const own = skip >= 0 ? nets[skip] : null;
	const ca = own ? su / own.step - 0.5 : 0;
	const cb = own ? sv / own.step - 0.5 : 0;

	for (let i = 0; i < 2; i++) {
		for (let j = 0; j < 2; j++) {
			for (let k = 0; k < 2; k++) {
				const key = hashOf(gx + i, gy + j, gz + k);

				if (only[key] === -1) continue;

				if (
					own &&
					only[key] === skip &&
					box[key * 4] > ca - SAME &&
					box[key * 4 + 1] < ca + SAME &&
					box[key * 4 + 2] > cb - SAME &&
					box[key * 4 + 3] < cb + SAME
				)
					continue;

				for (let e = start[key]; e < start[key + 1]; e++) {
					const id = entries[e];
					const dx = centres[id * 3] - x;
					const dy = centres[id * 3 + 1] - y;
					const dz = centres[id * 3 + 2] - z;
					const owner = owners[id];
					const net = nets[owner];
					const h = net.step;

					if (dx * dx + dy * dy + dz * dz > 1.1 * h * h) continue;

					const cell = cellsOf[id];
					const S = net.side;
					const a = Math.floor(cell / (S - 1));
					const b = cell % (S - 1);
					const u0 = (a - net.steps) * h;
					const v0 = (b - net.steps) * h;

					if (
						owner === skip &&
						Math.abs(u0 + h / 2 - su) < SAME * h &&
						Math.abs(v0 + h / 2 - sv) < SAME * h
					)
						continue;

					if (!locate(net, cell, x, y, z)) continue;

					const s = local[0];
					const t = local[1];
					const p = a * S + b;
					const cut = Math.min(
						lerp4(net.jam, p, S, s, t),
						lerp4(net.rim, p, S, s, t),
					);

					const seam = seams[owner];
					const margin = seam ? lerp4(seam, p, S, s, t) : OPEN;

					if (margin <= 0) continue;

					const cos = lerp4(net.cos, p, S, s, t);

					visit(
						owner,
						lerp4(pathOf(net), p, S, s, t),
						Math.sqrt(Math.max(1 - cos * cos, 1e-4)),
						cut,
					);
				}
			}
		}
	}
}

function seamsOf(index: Index, nets: Net[], usable: Uint8Array[]) {
	return nets.map((net, k) => {
		const S = net.side;
		const path = pathOf(net);
		const seam = new Float32Array(S * S).fill(-OPEN);
		const { pos } = net;
		const use = usable[k];
		const touched = new Uint8Array(S * S);

		for (let c = 0; c < use.length; c++) {
			if (!use[c]) continue;

			const p = corner(net, c);

			touched[p] = touched[p + 1] = touched[p + S] = touched[p + S + 1] = 1;
		}

		for (let a = 0; a < S; a++) {
			for (let b = 0; b < S; b++) {
				const p = a * S + b;

				if (!touched[p]) continue;

				const u = (a - net.steps) * net.step;
				const v = (b - net.steps) * net.step;
				const self = path[p];
				let other = OPEN;

				reachOf(
					index,
					nets,
					[],
					pos[p * 3],
					pos[p * 3 + 1],
					pos[p * 3 + 2],
					k,
					u,
					v,
					(_owner, distance, _sine, cut) => {
						other = Math.min(other, Math.max(distance - self, -cut));
					},
				);

				seam[p] = other;
			}
		}

		return seam;
	});
}

class Heap {
	keys = new Float64Array(1024);
	vals = new Int32Array(1024);
	size = 0;

	push(key: number, val: number) {
		if (this.size === this.keys.length) {
			const keys = new Float64Array(this.size * 2);
			const vals = new Int32Array(this.size * 2);

			keys.set(this.keys);
			vals.set(this.vals);
			this.keys = keys;
			this.vals = vals;
		}

		let i = this.size++;

		while (i > 0) {
			const parent = (i - 1) >> 1;

			if (this.keys[parent] <= key) break;

			this.keys[i] = this.keys[parent];
			this.vals[i] = this.vals[parent];
			i = parent;
		}

		this.keys[i] = key;
		this.vals[i] = val;
	}

	pop() {
		const top = this.vals[0];
		const key = this.keys[--this.size];
		const val = this.vals[this.size];
		let i = 0;

		for (;;) {
			let child = 2 * i + 1;

			if (child >= this.size) break;

			if (child + 1 < this.size && this.keys[child + 1] < this.keys[child])
				child++;

			if (this.keys[child] >= key) break;

			this.keys[i] = this.keys[child];
			this.vals[i] = this.vals[child];
			i = child;
		}

		this.keys[i] = key;
		this.vals[i] = val;

		return top;
	}
}

const SHIFT = 1 << 20;

function lay(nets: Net[], size: number) {
	const claimed = nets.map((net) => new Uint8Array((net.side - 1) ** 2));
	const seen = nets.map((net) => new Uint8Array((net.side - 1) ** 2));
	const total = claimed.reduce((sum, c) => sum + c.length, 0);
	const head = new Int32Array(TABLE).fill(-1);
	const next = new Int32Array(total);
	const owners = new Int32Array(total);
	const cells = new Int32Array(total);
	let count = 0;
	const heap = new Heap();

	const offer = (k: number, c: number) => {
		const net = nets[k];

		if (seen[k][c] || !alive(net, c)) return;

		seen[k][c] = 1;

		const p = corner(net, c);
		const S = net.side;
		const path = pathOf(net);

		heap.push(
			(path[p] + path[p + 1] + path[p + S] + path[p + S + 1]) / 4,
			k * SHIFT + c,
		);
	};

	for (let k = 0; k < nets.length; k++) {
		const N = nets[k].steps;
		const C = nets[k].side - 1;

		for (const c of [
			(N - 1) * C + (N - 1),
			(N - 1) * C + N,
			N * C + (N - 1),
			N * C + N,
		])
			offer(k, c);
	}

	while (heap.size > 0) {
		const val = heap.pop();
		const k = Math.floor(val / SHIFT);
		const c = val - k * SHIFT;
		const net = nets[k];
		const S = net.side;
		const C = S - 1;
		const p = corner(net, c);
		const q = p + S + 1;
		const { pos } = net;
		const x = (pos[p * 3] + pos[q * 3]) / 2;
		const y = (pos[p * 3 + 1] + pos[q * 3 + 1]) / 2;
		const z = (pos[p * 3 + 2] + pos[q * 3 + 2]) / 2;
		const a = Math.floor(c / C);
		const b = c % C;
		const gx = Math.floor(x / size - 0.5);
		const gy = Math.floor(y / size - 0.5);
		const gz = Math.floor(z / size - 0.5);
		let blocked = false;

		search: for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 2; j++) {
				for (let l = 0; l < 2; l++) {
					for (
						let e = head[hashOf(gx + i, gy + j, gz + l)];
						e >= 0;
						e = next[e]
					) {
						const owner = owners[e];
						const other = nets[owner];
						const cell = cells[e];
						const OC = other.side - 1;

						if (
							owner === k &&
							Math.abs(Math.floor(cell / OC) - a) < SAME &&
							Math.abs((cell % OC) - b) < SAME
						)
							continue;

						if (!locate(other, cell, x, y, z)) continue;

						const o = corner(other, cell);
						const OS = other.side;

						if (
							Math.min(
								lerp4(other.jam, o, OS, local[0], local[1]),
								lerp4(other.rim, o, OS, local[0], local[1]),
							) <= 0
						)
							continue;

						blocked = true;
						break search;
					}
				}
			}
		}

		if (blocked) {
			claimed[k][c] = 2;
			continue;
		}

		claimed[k][c] = 1;

		const key = hashOf(
			Math.floor(x / size),
			Math.floor(y / size),
			Math.floor(z / size),
		);

		owners[count] = k;
		cells[count] = c;
		next[count] = head[key];
		head[key] = count++;

		if (a > 0) offer(k, c - C);
		if (a < C - 1) offer(k, c + C);
		if (b > 0) offer(k, c - 1);
		if (b < C - 1) offer(k, c + 1);
	}

	return nets.map((net, k) => allow(net, claimed[k]));
}

function allow(net: Net, claimed: Uint8Array) {
	const C = net.side - 1;
	let keep = claimed;

	for (let pass = 0; pass < ALLOWANCE; pass++) {
		const next = keep.slice();

		for (let c = 0; c < keep.length; c++) {
			if (keep[c] || !alive(net, c)) continue;

			const a = Math.floor(c / C);
			const b = c % C;

			search: for (let da = -1; da <= 1; da++) {
				for (let db = -1; db <= 1; db++) {
					const na = a + da;
					const nb = b + db;

					if (na < 0 || nb < 0 || na >= C || nb >= C) continue;

					if (keep[na * C + nb]) {
						next[c] = 2;
						break search;
					}
				}
			}
		}

		keep = next;
	}

	return keep;
}

export function tailor(form: Form, nets: Net[]): Fit {
	if (nets.length === 0) return { cuts: [], coverage: 0, missed: [], cloth: 0 };

	const size = 2 * Math.max(...nets.map((n) => n.step));
	const usable = lay(nets, size);
	const final = build(nets, usable, size);
	const seams = seamsOf(final, nets, usable);
	const owned = new Float64Array(nets.length);
	const used = new Float64Array(nets.length);
	const missed: number[] = [];
	const { samples } = form;
	const count = samples.length / 3;
	let covered = 0;

	for (let i = 0; i < count; i++) {
		let best = -1;
		let near = OPEN;
		let sin = 1;

		reachOf(
			final,
			nets,
			seams,
			samples[i * 3],
			samples[i * 3 + 1],
			samples[i * 3 + 2],
			-1,
			0,
			0,
			(owner, distance, sine, cut) => {
				if (cut <= 0) return;

				if (distance < near) {
					near = distance;
					best = owner;
					sin = sine;
				}
			},
		);

		if (best >= 0) {
			covered++;
			owned[best]++;
			used[best] += 1 / sin;
		} else missed.push(i);
	}

	const cuts = nets.map((net, k) => {
		const keep = usable[k];
		const S = net.side;
		const h = net.step;
		let cells = 0;
		let minU = 0;
		let maxU = 0;
		let minV = 0;
		let maxV = 0;

		for (let c = 0; c < keep.length; c++) {
			if (!keep[c]) continue;

			const a = Math.floor(c / (S - 1));
			const b = c % (S - 1);
			const u = (a - net.steps) * h;
			const v = (b - net.steps) * h;

			cells++;
			minU = Math.min(minU, u);
			maxU = Math.max(maxU, u + h);
			minV = Math.min(minV, v);
			maxV = Math.max(maxV, v + h);
		}

		return {
			net,
			seam: seams[k],
			keep,
			cells,
			cloth: (used[k] / count) * form.area,
			covered: owned[k] / count,
			bounds: [minU, maxU, minV, maxV] as [number, number, number, number],
		};
	});

	return {
		cuts,
		coverage: covered / count,
		missed,
		cloth: covered ? used.reduce((sum, x) => sum + x, 0) / covered : 0,
	};
}
