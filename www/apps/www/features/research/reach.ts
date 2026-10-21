export const SINK = 2.9332e-2;
export const STEADY = 3;
export const MM = 1000;

const STEPS = 90;
const TOLERANCE = 1e-12;
const P = 0.3275911;
const A = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];

export interface Agent {
	name: string;
	weight: number;
	diffusivity: number;
	ic50: number;
}

export interface Cavity {
	concentration: number;
	dwell: number;
	clearance: number;
}

export interface Reading {
	lambdaMm: number;
	depthMm: number;
	touched: number;
	coreMm: number;
	thiele: number;
	damkohler: number;
	ratio: number;
	steady: boolean;
}

export interface Band {
	agent: string;
	concentration: number;
	low: number;
	high: number;
}

export const BANDS: Band[] = [
	{ agent: "Cisplatin", concentration: 0.8, low: 0.36, high: 0.49 },
	{ agent: "Paclitaxel", concentration: 0.14, low: 0.54, high: 0.75 },
];

export const AGENTS: Agent[] = [
	{
		name: "Cisplatin",
		weight: 300,
		diffusivity: 2.5e-10,
		ic50: 6.2e-3,
	},
	{
		name: "Paclitaxel",
		weight: 853.9,
		diffusivity: 0.77e-10,
		ic50: 1.4e-6,
	},
	{
		name: "Antibody",
		weight: 150000,
		diffusivity: 1e-11,
		ic50: 1e-6,
	},
];

function erfcxPositive(z: number): number {
	const t = 1 / (1 + P * z);

	return t * (A[0] + t * (A[1] + t * (A[2] + t * (A[3] + t * A[4]))));
}

export function decay(agent: Agent, cavity: Cavity): number {
	return Math.sqrt(agent.diffusivity / cavity.clearance);
}

export function damkohler(cavity: Cavity): number {
	return cavity.clearance * cavity.dwell;
}

export function settled(cavity: Cavity): boolean {
	return damkohler(cavity) >= STEADY;
}

export function shareSphere(
	radius: number,
	depth: number,
	length: number,
): number {
	if (depth <= 0) return 1;

	const reached = Math.min(depth, radius);
	const inner = radius - reached;

	if (inner <= 0) {
		const whole = -Math.expm1((-2 * radius) / length);

		return (((2 * radius) / length) * Math.exp(-radius / length)) / whole;
	}

	const far = -Math.expm1((-2 * inner) / length);
	const whole = -Math.expm1((-2 * radius) / length);

	return (radius / inner) * Math.exp(-reached / length) * (far / whole);
}

export function shareSlab(agent: Agent, cavity: Cavity, depth: number): number {
	if (depth <= 0) return 1;

	const front = depth / (2 * Math.sqrt(agent.diffusivity * cavity.dwell));
	const decayed = Math.sqrt(damkohler(cavity));
	const weight = Math.exp(-(front * front + decayed * decayed));
	const far = erfcxPositive(front + decayed);

	if (front >= decayed) {
		return 0.5 * weight * (erfcxPositive(front - decayed) + far);
	}

	return (
		0.5 *
		(2 * Math.exp(-2 * front * decayed) -
			weight * erfcxPositive(decayed - front) +
			weight * far)
	);
}

export function share(
	agent: Agent,
	cavity: Cavity,
	radius: number,
	depth: number,
): number {
	if (settled(cavity)) {
		return shareSphere(radius, depth, decay(agent, cavity));
	}

	return shareSlab(agent, cavity, depth);
}

export function penetration(
	agent: Agent,
	cavity: Cavity,
	radius: number,
): number {
	const target = agent.ic50 / cavity.concentration;

	if (target >= 1) return 0;

	if (share(agent, cavity, radius, radius) >= target) return radius;

	let low = 0;
	let high = radius;

	for (let step = 0; step < STEPS; step += 1) {
		const middle = (low + high) / 2;

		if (share(agent, cavity, radius, middle) >= target) low = middle;
		else high = middle;

		if (high - low < TOLERANCE * radius) break;
	}

	return (low + high) / 2;
}

export function touched(radius: number, depth: number): number {
	if (depth >= radius) return 1;

	if (depth <= 0) return 0;

	const inner = (radius - depth) / radius;

	return 1 - inner * inner * inner;
}

export function reading(agent: Agent, cavity: Cavity, radius: number): Reading {
	const length = decay(agent, cavity);
	const depth = penetration(agent, cavity, radius);

	return {
		lambdaMm: length * MM,
		depthMm: depth * MM,
		touched: touched(radius, depth),
		coreMm: Math.max(0, radius - depth) * MM,
		thiele: radius / length,
		damkohler: damkohler(cavity),
		ratio: cavity.concentration / agent.ic50,
		steady: settled(cavity),
	};
}
