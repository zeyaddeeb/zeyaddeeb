import { describe, expect, it } from "vitest";
import {
	AGENTS,
	type Cavity,
	damkohler,
	decay,
	reading,
	SINK,
	settled,
	shareSlab,
	shareSphere,
} from "./reach";

const SPHERE = 0.01;

function bath(concentration: number, dwell = 1800): Cavity {
	return { concentration, dwell, clearance: SINK };
}

function agent(name: string) {
	const found = AGENTS.find((one) => one.name === name);

	if (!found) throw new Error(`no agent ${name}`);

	return found;
}

describe("the published depths are reproduced", () => {
	it("puts cisplatin inside the band Steuperaert reports", () => {
		const found = reading(agent("Cisplatin"), bath(0.8), SPHERE);

		expect(found.depthMm).toBeGreaterThanOrEqual(0.36);
		expect(found.depthMm).toBeLessThanOrEqual(0.49);
	});

	it("puts paclitaxel inside its band", () => {
		const found = reading(agent("Paclitaxel"), bath(0.14), SPHERE);

		expect(found.depthMm).toBeGreaterThanOrEqual(0.54);
		expect(found.depthMm).toBeLessThanOrEqual(0.75);
	});

	it("agrees with the server kernel to four figures", () => {
		expect(reading(agent("Cisplatin"), bath(0.8), SPHERE).depthMm).toBeCloseTo(
			0.453,
			3,
		);
		expect(
			reading(agent("Paclitaxel"), bath(0.14), SPHERE).depthMm,
		).toBeCloseTo(0.593, 3);
	});
});

describe("the closed-form limits hold", () => {
	it("tends to the steady state as the dwell grows", () => {
		const brief = reading(agent("Cisplatin"), bath(0.8, 1800), SPHERE);
		const long = reading(agent("Cisplatin"), bath(0.8, 86400), SPHERE);

		expect(long.depthMm).toBeCloseTo(brief.depthMm, 4);
	});

	it("does not call a short dwell steady", () => {
		expect(settled(bath(0.8, 1))).toBe(false);
		expect(settled(bath(0.8, 1800))).toBe(true);
		expect(damkohler(bath(0.8, 1800))).toBeGreaterThan(3);
	});

	it("treats a nodule smaller than lambda throughout", () => {
		const length = decay(agent("Cisplatin"), bath(0.8));
		const found = reading(agent("Cisplatin"), bath(0.8), length / 50);

		expect(found.touched).toBeGreaterThan(0.99);
	});

	it("leaves a core in a nodule larger than lambda", () => {
		const found = reading(agent("Cisplatin"), bath(0.8), SPHERE);

		expect(found.coreMm).toBeGreaterThan(9);
	});

	it("scales depth as the square root of diffusivity", () => {
		const slow = agent("Cisplatin");
		const quick = { ...slow, diffusivity: slow.diffusivity * 4 };
		const base = reading(slow, bath(0.8), SPHERE).depthMm;
		const faster = reading(quick, bath(0.8), SPHERE).depthMm;

		expect(faster / base).toBeCloseTo(2, 1);
	});

	it("reaches further in a sphere than in a slab at one depth", () => {
		const drug = agent("Cisplatin");
		const cavity = bath(0.8);
		const length = decay(drug, cavity);

		expect(shareSphere(SPHERE, length, length)).toBeGreaterThan(
			shareSlab(drug, cavity, length),
		);
	});

	it("falls to one over e at one decay length in a slab", () => {
		const drug = agent("Cisplatin");
		const cavity = bath(0.8);

		expect(shareSlab(drug, cavity, decay(drug, cavity))).toBeCloseTo(
			Math.exp(-1),
			3,
		);
	});
});

describe("what it refuses", () => {
	it("leaves the core of any real nodule untouched for an antibody", () => {
		const found = reading(agent("Antibody"), bath(0.14), SPHERE);

		expect(found.lambdaMm).toBeLessThan(0.05);
		expect(found.touched).toBeLessThan(0.1);
	});

	it("reaches nothing when the bath is below the killing level", () => {
		const drug = agent("Cisplatin");
		const found = reading(drug, bath(drug.ic50 / 2), SPHERE);

		expect(found.depthMm).toBe(0);
		expect(found.touched).toBe(0);
	});
});
