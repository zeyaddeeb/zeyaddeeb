import { describe, expect, it } from "vitest";
import { formOf, SADDLE_DEPTH } from "./forms";
import { weave } from "./net";

function chebyshev(x: number) {
	const x0 = 0.02;
	let y = Math.PI / 2 - x0 + x0 ** 3 / 18 - (7 * x0 ** 5) / 1800;
	let dy = -1 + x0 ** 2 / 6 - (7 * x0 ** 4) / 360;
	let t = x0;
	const n = 4000;
	const dt = (x - x0) / n;
	const f = (s: number, a: number, b: number) => -(b + Math.sin(a)) / s;

	for (let i = 0; i < n; i++) {
		const k1 = dy;
		const l1 = f(t, y, dy);
		const k2 = dy + (dt / 2) * l1;
		const l2 = f(t + dt / 2, y + (dt / 2) * k1, dy + (dt / 2) * l1);
		const k3 = dy + (dt / 2) * l2;
		const l3 = f(t + dt / 2, y + (dt / 2) * k2, dy + (dt / 2) * l2);
		const k4 = dy + dt * l3;
		const l4 = f(t + dt, y + dt * k3, dy + dt * l3);

		y += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
		dy += (dt / 6) * (l1 + 2 * l2 + 2 * l3 + l4);
		t += dt;
	}

	return y;
}

function area(
	net: ReturnType<typeof weave>,
	a0: number,
	a1: number,
	b0: number,
	b1: number,
	weight: (x: number, y: number, z: number) => number,
) {
	const { pos, side } = net;
	let sum = 0;

	const tri = (p: number, q: number, r: number) => {
		const ux = pos[q * 3] - pos[p * 3];
		const uy = pos[q * 3 + 1] - pos[p * 3 + 1];
		const uz = pos[q * 3 + 2] - pos[p * 3 + 2];
		const vx = pos[r * 3] - pos[p * 3];
		const vy = pos[r * 3 + 1] - pos[p * 3 + 1];
		const vz = pos[r * 3 + 2] - pos[p * 3 + 2];
		const cx = (pos[p * 3] + pos[q * 3] + pos[r * 3]) / 3;
		const cy = (pos[p * 3 + 1] + pos[q * 3 + 1] + pos[r * 3 + 1]) / 3;
		const cz = (pos[p * 3 + 2] + pos[q * 3 + 2] + pos[r * 3 + 2]) / 3;

		return (
			(weight(cx, cy, cz) *
				Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)) /
			2
		);
	};

	for (let a = a0; a < a1; a++) {
		for (let b = b0; b < b1; b++) {
			const p = a * side + b;

			sum += tri(p, p + side, p + side + 1) + tri(p, p + side + 1, p + 1);
		}
	}

	return sum;
}

const angle = (net: ReturnType<typeof weave>, a: number, b: number) =>
	Math.acos(net.cos[a * net.side + b]);

describe("Chebyshev's net on the ball", () => {
	const ball = formOf("ball");
	const net = weave(ball, { pin: [0, 0, 1], warp: [1, 0, 0] }, 0.02, 0, 100);
	const N = net.steps;

	it("keeps every thread the same length", () => {
		const { pos, side } = net;
		const i = (N + 30) * side + (N + 40);
		const j = (N + 31) * side + (N + 40);
		const k = (N + 30) * side + (N + 41);
		const len = (p: number, q: number) =>
			Math.hypot(
				pos[q * 3] - pos[p * 3],
				pos[q * 3 + 1] - pos[p * 3 + 1],
				pos[q * 3 + 2] - pos[p * 3 + 2],
			);

		expect(len(i, j)).toBeCloseTo(0.02, 10);
		expect(len(i, k)).toBeCloseTo(0.02, 10);
	});

	it("matches Chebyshev's series: the angle depends only on uv", () => {
		for (const [i, j] of [
			[20, 20],
			[40, 30],
			[60, 10],
			[50, 50],
		]) {
			const uv = i * j * 0.02 * 0.02;

			expect(angle(net, N + i, N + j)).toBeCloseTo(chebyshev(uv), 2);
			expect(angle(net, N - i, N - j)).toBeCloseTo(chebyshev(uv), 2);
			expect(angle(net, N + i, N - j)).toBeCloseTo(Math.PI - chebyshev(uv), 2);
		}
	});

	it("folds where Ghys says, at uv = 1.8616", () => {
		const diagonal = [];

		for (let k = 1; k <= N; k++)
			if (net.has[(N + k) * net.side + (N + k)]) diagonal.push(k);

		const reach = Math.max(...diagonal) * 0.02;

		expect(reach * reach).toBeGreaterThan(1.75);
		expect(reach * reach).toBeLessThan(1.8616);
	});

	it("obeys Hazzidakis: the patch's area is π/2 minus its far corner", () => {
		for (const [i, j] of [
			[30, 30],
			[50, 20],
			[60, 45],
		]) {
			const patch = area(net, N, N + i, N, N + j, () => 1);

			expect(patch).toBeCloseTo(Math.PI / 2 - angle(net, N + i, N + j), 2);
		}
	});
});

describe("Chebyshev's net on the saddle", () => {
	const saddle = formOf("saddle");
	const net = weave(
		saddle,
		{ pin: [0.2, -0.1, (SADDLE_DEPTH * (0.04 - 0.01)) / 2], warp: [1, 0.3, 0] },
		0.02,
		0,
		60,
	);
	const N = net.steps;

	it("turns the other way, and still obeys Hazzidakis", () => {
		const i = 30;
		const j = 25;
		const curve = area(net, N, N + i, N, N + j, saddle.curvature);
		const turn =
			angle(net, N, N + j) +
			angle(net, N + i, N) -
			angle(net, N, N) -
			angle(net, N + i, N + j);

		expect(angle(net, N + i, N + j)).toBeGreaterThan(Math.PI / 2);
		expect(curve).toBeLessThan(0);
		expect(curve).toBeCloseTo(turn, 2);
	});
});
