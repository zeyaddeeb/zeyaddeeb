import { readFileSync } from "node:fs";
import { expect, describe as group, it } from "vitest";
import {
	agreement,
	CHAOS,
	CLOCKS,
	describe,
	ending,
	FAR_MAX,
	FAR_MIN,
	fill,
	growth,
	HOMOCLINIC,
	HOPF,
	NEAR_MAX,
	NEAR_WIDTH,
	regime,
	rhoAt,
	SIGMA,
	settleRadius,
	splash,
	split,
	steadyBeat,
	tally,
	tallyText,
	uAt,
	verdict,
	weight,
	within,
} from "./model";

const rs = readFileSync(
	new URL("../../../../packages/wasm/src/attractor.rs", import.meta.url),
	"utf8",
);

type Vec3 = [number, number, number];

function rk4(f: (s: Vec3) => Vec3, s: Vec3, h: number): Vec3 {
	const add = (a: Vec3, b: Vec3, k: number): Vec3 => [
		a[0] + b[0] * k,
		a[1] + b[1] * k,
		a[2] + b[2] * k,
	];
	const k1 = f(s);
	const k2 = f(add(s, k1, h / 2));
	const k3 = f(add(s, k2, h / 2));
	const k4 = f(add(s, k3, h));
	return [0, 1, 2].map(
		(i) => s[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]),
	) as Vec3;
}

group("the waterwheel is the Lorenz system with β = 1", () => {
	it("matches Lorenz after rescaling", () => {
		const K = 0.7;
		const nu = 2.1;
		const I = 0.3;
		const g = 9.8;
		const r = 0.4;
		const q1 = 1.9;
		const c = (Math.PI * g * r) / (K * nu);
		const sigma = nu / (I * K);
		const rho = (Math.PI * g * r * q1) / (K * K * nu);
		const wheel = ([a, b, w]: Vec3): Vec3 => [
			w * b - K * a,
			-w * a - K * b + q1,
			(-nu * w + Math.PI * g * r * a) / I,
		];
		const lorenz = ([x, y, z]: Vec3): Vec3 => [
			sigma * (y - x),
			rho * x - y - x * z,
			x * y - 1 * z,
		];
		let physical: Vec3 = [0.2, 1.1, 0.3];
		let scaled: Vec3 = [
			physical[2] / K,
			c * physical[0],
			rho - c * physical[1],
		];
		const steps = 400;
		const tau = 2;
		for (let i = 0; i < steps; i++) {
			physical = rk4(wheel, physical, tau / K / steps);
			scaled = rk4(lorenz, scaled, tau / steps);
		}
		expect(physical[2] / K).toBeCloseTo(scaled[0], 6);
		expect(c * physical[0]).toBeCloseTo(scaled[1], 6);
		expect(rho - c * physical[1]).toBeCloseTo(scaled[2], 6);
	});

	it("agrees with the Rust constants", () => {
		expect(rs).toMatch(/pub const BETA: f64 = 1\.0;/);
		expect(HOPF).toBe(17.5);
		expect(SIGMA).toBe(10);
	});

	it("keeps the homoclinic point inside the Rust test bracket", () => {
		const low = Number(
			rs.match(
				/from_rest\(([\d.]+)\), CLOCKWISE\);\n\s*assert_eq!\(from_rest\(([\d.]+)\), COUNTER/,
			)?.[1],
		);
		const high = Number(rs.match(/from_rest\(([\d.]+)\), COUNTER\);/)?.[1]);
		expect(HOMOCLINIC).toBeGreaterThan(low);
		expect(HOMOCLINIC).toBeLessThan(high);
	});
});

group("the tap", () => {
	it("round-trips flow and position", () => {
		for (const rho of [0, 0.5, 1, 8, 17.5, 28, 45, 316, 330, 350]) {
			expect(rhoAt(uAt(rho))).toBeCloseTo(rho, 9);
		}
	});

	it("never lands inside the axis break", () => {
		for (let u = 0; u <= 1; u += 0.001) {
			const rho = rhoAt(u);
			expect(rho <= NEAR_MAX || rho >= FAR_MIN).toBe(true);
		}
		expect(rhoAt(NEAR_WIDTH)).toBe(NEAR_MAX);
		expect(rhoAt(1)).toBe(FAR_MAX);
	});

	it("names the regimes in order", () => {
		expect(regime(0.5)).toBe("rest");
		expect(regime(5)).toBe("turns");
		expect(regime(12)).toBe("tangled");
		expect(regime(CHAOS + 0.1)).toBe("chaos");
		expect(regime(27)).toBe("clock");
		expect(regime(28)).toBe("chaos");
		expect(regime(340)).toBe("clock");
		expect(CLOCKS.every(([a, b]) => a < b)).toBe(true);
	});
});

group("the drawing", () => {
	it("fills the top cup and leaves the weight high when resting", () => {
		const top = fill(0, 0, 0, 0.8);
		const bottom = fill(Math.PI, 0, 0, 0.8);
		expect(top).toBeGreaterThan(bottom);
		expect(weight(0, 0, 0.8).up).toBeGreaterThan(0);
		expect(weight(0, 0, 0.8).right).toBe(0);
	});

	it("puts the weight on the right when y is positive", () => {
		expect(weight(5, 20, 28).right).toBeGreaterThan(0);
		expect(fill(Math.PI / 2, 5, 20, 28)).toBeGreaterThan(
			fill(-Math.PI / 2, 5, 20, 28),
		);
	});

	it("keeps every cup between empty and full", () => {
		for (let rho = 0.2; rho < 350; rho *= 1.7) {
			for (const [y, z] of [
				[0, 0],
				[rho, 0],
				[-rho, 2 * rho],
			]) {
				for (let t = 0; t < 6.3; t += 0.3) {
					const f = fill(t, y ?? 0, z ?? 0, rho);
					expect(f).toBeGreaterThanOrEqual(0);
					expect(f).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

group("the words", () => {
	const observations = [
		{
			rho: 0.5,
			ending: "rest" as const,
			flips: 0,
			steady: false,
			moving: false,
		},
		{
			rho: 5,
			ending: "clockwise" as const,
			flips: 0,
			steady: false,
			moving: true,
		},
		{
			rho: 12,
			ending: "anticlockwise" as const,
			flips: 3,
			steady: false,
			moving: true,
		},
		{ rho: 12, ending: null, flips: 2, steady: false, moving: true },
		{ rho: 28, ending: null, flips: 14, steady: false, moving: true },
		{ rho: 27, ending: null, flips: 30, steady: true, moving: true },
		{
			rho: 16,
			ending: "clockwise" as const,
			flips: 0,
			steady: false,
			moving: true,
		},
	];

	it("speaks plainly, without symbols", () => {
		for (const o of observations) {
			const text = describe(o);
			expect(text.length).toBeGreaterThan(20);
			expect(text).not.toMatch(/[ρσβλ=]/);
			expect(text).not.toMatch(/attractor|bifurcation|lyapunov/i);
		}
	});

	it("counts reversals in words", () => {
		const [, , settled, sloshing] = observations;
		if (!settled || !sloshing) throw new Error("missing observations");
		expect(describe(sloshing)).toContain("twice");
		expect(describe(settled)).toContain("3 times");
	});

	it("hears a steady beat only when the gaps repeat", () => {
		expect(steadyBeat([0, 1, 2, 3, 4, 5, 6])).toBe(true);
		expect(steadyBeat([0, 1, 2.6, 3, 5, 5.4, 7])).toBe(false);
	});
});

group("the rounding error", () => {
	it("recovers the pace of an exponential gap", () => {
		const gaps = Array.from({ length: 400 }, (_, i) => {
			const t = i * 0.1;
			return { t, gap: Math.min(5e-4 * 10 ** (t / 3), 30) };
		});
		expect(growth(gaps, 28 * 0.8)).toBeCloseTo(3, 3);
		expect(verdict(gaps, 28)).toContain("nothing in common");
	});

	it("notices when the copy catches up", () => {
		const gaps = Array.from({ length: 120 }, (_, i) => ({
			t: i * 0.1,
			gap: 5e-4 * 0.5 ** i,
		}));
		expect(verdict(gaps, 5)).toContain("catching up");
	});

	it("highlights digits from the first difference", () => {
		expect(split(" 12.345678", " 12.346021")).toEqual({
			same: " 12.34",
			different: "6021",
		});
	});
});

group("the dropped wheels", () => {
	const at = (points: number[][]) => new Float32Array(points.flat());

	it("say they are together until they spread", () => {
		const rho = 28;
		const close = at(
			Array.from({ length: 100 }, (_, i) => [5 + i * 1e-3, 5, 20]),
		);
		expect(tallyText(tally(close, rho), rho)).toContain("together");
		const apart = at(
			Array.from({ length: 100 }, (_, i) => [i < 60 ? 8 : -8, 0, 20]),
		);
		const t = tally(apart, rho);
		expect(t.clockwise).toBe(60);
		expect(t.anticlockwise).toBe(40);
		expect(tallyText(t, rho)).toContain("none of them will ever settle");
	});

	it("report a split once they settle", () => {
		const rho = 5;
		const c = Math.sqrt(rho - 1);
		const split = at(
			Array.from({ length: 10 }, (_, i) =>
				i < 7 ? [c, c, rho - 1] : [-c, -c, rho - 1],
			),
		);
		expect(tallyText(tally(split, rho), rho)).toBe(
			"They split: 7 ended up turning clockwise, 3 anticlockwise.",
		);
	});

	it("never call a wheel settled once steady turning is unstable", () => {
		const c = Math.sqrt(27);
		expect(ending(c, c, 27, 28)).toBeNull();
		expect(ending(c, c, 11, 12)).toBeNull();
		expect(ending(Math.sqrt(11), Math.sqrt(11), 11, 12)).toBe("clockwise");
	});

	it("use the settle radius the Rust tests check", () => {
		expect(rs).toContain("(0.5 * margin).max(0.02) * fixed(rho)");
		expect(settleRadius(5)).toBeCloseTo(0.5 * Math.sqrt(1 - 5 / HOPF) * 2, 12);
	});
});

group("a splash", () => {
	it("tips the weight toward the cup it lands in", () => {
		const right = splash(Math.PI / 2, 28);
		expect(right.dy).toBeGreaterThan(0);
		expect(Math.abs(right.dz)).toBeLessThan(1e-9);
		const top = splash(0, 28);
		expect(top.dz).toBeLessThan(0);
	});

	it("counts decimal places that still agree", () => {
		expect(agreement(8.7e-4)).toBe(3);
		expect(agreement(0.02)).toBe(1);
		expect(agreement(3)).toBe(0);
		expect(within(3)).toBe("0.001");
		expect(within(1)).toBe("0.1");
	});
});
