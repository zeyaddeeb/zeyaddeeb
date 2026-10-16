export type FormId = "ball" | "saddle" | "bagel";

export interface Mesh {
	positions: Float32Array;
	normals: Float32Array;
	index: Uint32Array;
}

export interface Form {
	id: FormId;
	name: string;
	value(x: number, y: number, z: number): number;
	gradient(x: number, y: number, z: number, out: Float64Array): void;
	curvature(x: number, y: number, z: number): number;
	rim(x: number, y: number, z: number): number;
	reach: number;
	area: number;
	radius: number;
	samples: Float64Array;
	mesh: Mesh;
}

const SAMPLES = 8000;
const TAU = Math.PI * 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const PLASTIC = 1.22074408460576;
const STEPS = [1 / PLASTIC, 1 / PLASTIC ** 2, 1 / PLASTIC ** 3];

const frac = (x: number) => x - Math.floor(x);

function sequence(i: number, axis: number) {
	return frac(0.5 + STEPS[axis] * i);
}

function grid(
	rows: number,
	cols: number,
	at: (i: number, j: number) => [number, number, number],
	normal: (x: number, y: number, z: number, out: Float64Array) => void,
	wrapRows: boolean,
	wrapCols: boolean,
): Mesh {
	const r = wrapRows ? rows : rows + 1;
	const c = wrapCols ? cols : cols + 1;
	const positions = new Float32Array(r * c * 3);
	const normals = new Float32Array(r * c * 3);
	const g = new Float64Array(3);

	for (let i = 0; i < r; i++) {
		for (let j = 0; j < c; j++) {
			const [x, y, z] = at(i, j);
			const k = (i * c + j) * 3;

			normal(x, y, z, g);

			const len = Math.hypot(g[0], g[1], g[2]) || 1;

			positions[k] = x;
			positions[k + 1] = y;
			positions[k + 2] = z;
			normals[k] = g[0] / len;
			normals[k + 1] = g[1] / len;
			normals[k + 2] = g[2] / len;
		}
	}

	const index: number[] = [];

	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			const i1 = wrapRows ? (i + 1) % rows : i + 1;
			const j1 = wrapCols ? (j + 1) % cols : j + 1;
			const a = i * c + j;
			const b = i1 * c + j;
			const d = i * c + j1;
			const e = i1 * c + j1;

			index.push(a, b, e, a, e, d);
		}
	}

	return { positions, normals, index: Uint32Array.from(index) };
}

function makeBall(): Form {
	const value = (x: number, y: number, z: number) => x * x + y * y + z * z - 1;
	const gradient = (x: number, y: number, z: number, out: Float64Array) => {
		out[0] = 2 * x;
		out[1] = 2 * y;
		out[2] = 2 * z;
	};
	const samples = new Float64Array(SAMPLES * 3);

	for (let i = 0; i < SAMPLES; i++) {
		const z = 1 - (2 * (i + 0.5)) / SAMPLES;
		const r = Math.sqrt(1 - z * z);
		const phi = i * GOLDEN;

		samples[i * 3] = r * Math.cos(phi);
		samples[i * 3 + 1] = r * Math.sin(phi);
		samples[i * 3 + 2] = z;
	}

	const mesh = grid(
		64,
		128,
		(i, j) => {
			const theta = (Math.PI * i) / 64;
			const phi = (TAU * j) / 128;

			return [
				Math.sin(theta) * Math.cos(phi),
				Math.sin(theta) * Math.sin(phi),
				Math.cos(theta),
			];
		},
		gradient,
		false,
		true,
	);

	return {
		id: "ball",
		name: "Ball",
		value,
		gradient,
		curvature: () => 1,
		rim: () => Number.POSITIVE_INFINITY,
		reach: 3.4,
		area: 4 * Math.PI,
		radius: 1,
		samples,
		mesh,
	};
}

export const SADDLE_RIM = 1.2;
export const SADDLE_DEPTH = 1.6;

function makeSaddle(): Form {
	const rho = SADDLE_RIM;
	const k = SADDLE_DEPTH;
	const height = (x: number, y: number) => (k * (x * x - y * y)) / 2;
	const value = (x: number, y: number, z: number) => z - height(x, y);
	const gradient = (x: number, y: number, _z: number, out: Float64Array) => {
		out[0] = -k * x;
		out[1] = k * y;
		out[2] = 1;
	};
	const samples = new Float64Array(SAMPLES * 3);
	const top = Math.sqrt(1 + k * k * rho * rho);
	let n = 0;
	let i = 0;

	while (n < SAMPLES) {
		const r = rho * Math.sqrt(sequence(i, 0));
		const phi = TAU * sequence(i, 1);
		const keep = sequence(i, 2);

		i++;

		if (keep * top > Math.sqrt(1 + k * k * r * r)) continue;

		const x = r * Math.cos(phi);
		const y = r * Math.sin(phi);

		samples[n * 3] = x;
		samples[n * 3 + 1] = y;
		samples[n * 3 + 2] = height(x, y);
		n++;
	}

	const mesh = grid(
		48,
		128,
		(i, j) => {
			const r = (rho * i) / 48;
			const phi = (TAU * j) / 128;
			const x = r * Math.cos(phi);
			const y = r * Math.sin(phi);

			return [x, y, height(x, y)];
		},
		gradient,
		false,
		true,
	);

	return {
		id: "saddle",
		name: "Saddle",
		value,
		gradient,
		curvature: (x, y) => -(k * k) / (1 + k * k * (x * x + y * y)) ** 2,
		rim: (x, y) => rho - Math.hypot(x, y),
		reach: 2.8,
		area: (TAU * ((1 + k * k * rho * rho) ** 1.5 - 1)) / (3 * k * k),
		radius: Math.hypot(rho, (k * rho * rho) / 2),
		samples,
		mesh,
	};
}

export const BAGEL_R = 1;
export const BAGEL_TUBE = 0.5;

function makeBagel(): Form {
	const R = BAGEL_R;
	const r = BAGEL_TUBE;
	const value = (x: number, y: number, z: number) => {
		const q = Math.hypot(x, y) - R;

		return q * q + z * z - r * r;
	};
	const gradient = (x: number, y: number, z: number, out: Float64Array) => {
		const q = Math.hypot(x, y) || 1e-12;
		const k = (2 * (q - R)) / q;

		out[0] = k * x;
		out[1] = k * y;
		out[2] = 2 * z;
	};
	const samples = new Float64Array(SAMPLES * 3);

	for (let i = 0; i < SAMPLES; i++) {
		const t = sequence(i, 0);
		let theta = TAU * t;

		for (let k = 0; k < 8; k++) {
			const f = (R * theta + r * Math.sin(theta)) / (TAU * R) - t;
			const df = (R + r * Math.cos(theta)) / (TAU * R);

			theta -= f / df;
		}

		const phi = TAU * sequence(i, 1);
		const q = R + r * Math.cos(theta);

		samples[i * 3] = q * Math.cos(phi);
		samples[i * 3 + 1] = q * Math.sin(phi);
		samples[i * 3 + 2] = r * Math.sin(theta);
	}

	const mesh = grid(
		48,
		128,
		(i, j) => {
			const theta = (TAU * i) / 48;
			const phi = (TAU * j) / 128;
			const q = R + r * Math.cos(theta);

			return [q * Math.cos(phi), q * Math.sin(phi), r * Math.sin(theta)];
		},
		gradient,
		true,
		true,
	);

	return {
		id: "bagel",
		name: "Bagel",
		value,
		gradient,
		curvature: (x, y) => {
			const cos = (Math.hypot(x, y) - R) / r;

			return cos / (r * (R + r * cos));
		},
		rim: () => Number.POSITIVE_INFINITY,
		reach: 4.2,
		area: 4 * Math.PI * Math.PI * R * r,
		radius: R + r,
		samples,
		mesh,
	};
}

const cache = new Map<FormId, Form>();

const makers: Record<FormId, () => Form> = {
	ball: makeBall,
	saddle: makeSaddle,
	bagel: makeBagel,
};

export function formOf(id: FormId): Form {
	let form = cache.get(id);

	if (!form) {
		form = makers[id]();
		cache.set(id, form);
	}

	return form;
}

export const FORMS: FormId[] = ["ball", "saddle", "bagel"];
