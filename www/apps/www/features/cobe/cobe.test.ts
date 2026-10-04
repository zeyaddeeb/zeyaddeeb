import { readFileSync } from "node:fs";
import { expect, describe as group, it } from "vitest";
import { experiments } from "../catalog/catalog";
import {
	angles,
	type Caption,
	celsius,
	crossing,
	describe,
	dot,
	type Flow,
	HEATER_START,
	isMatched,
	kelvin,
	kelvinPerTurn,
	MATCH_K,
	type Match,
	MILKY_K,
	needleTurn,
	OPENING,
	opposite,
	QUIET_K,
	type Reading,
	record,
	SCALES,
	START_FLOW,
	sideOn,
	speedOf,
	vec,
	zoomFor,
} from "./model";
import { RECORDING_ID, RERUN_VERSION, TIMELINE, VIEWER_CDN } from "./rerun";
import { SPECTRUM } from "./spectrum-data";

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");

const ahead = vec(265.08, 47.92);
const behind = opposite(ahead);
const T = 2.72548;

function reading(over: Partial<Reading> = {}): Reading {
	return {
		gap: 0.5,
		leftover: 0,
		heater: HEATER_START,
		matched: false,
		...over,
	};
}

function match(dir: Match["dir"], heater: number, lean: number): Match {
	return { dir, heater, lean };
}

const fakeSpeed = (a: Match, b: Match) =>
	(299792.458 * (a.heater - b.heater)) /
	(0.5 * (a.heater + b.heater)) /
	(a.lean - b.lean);

group("directions", () => {
	it("round-trips galactic angles", () => {
		const { l, b } = angles(vec(265.08, 47.92));

		expect(l).toBeCloseTo(265.08, 6);
		expect(b).toBeCloseTo(47.92, 6);
	});

	it("points the other way through the center", () => {
		expect(dot(ahead, behind)).toBeCloseTo(-1, 12);
	});
});

group("needle gearing", () => {
	it("zooms in as the gap closes and back out when it opens", () => {
		expect(zoomFor(2, 0)).toBe(0);
		expect(zoomFor(0.2, 0)).toBe(0);
		expect(zoomFor(0.05, 0)).toBe(1);
		expect(zoomFor(1e-4, 0)).toBe(3);
		expect(zoomFor(0.5, 3)).toBe(0);
	});

	it("zooms in only where the finer needle stays on its scale", () => {
		for (let level = 0; level < SCALES.length - 1; level++) {
			const edge = 0.099 * SCALES[level];

			expect(zoomFor(edge, level)).toBeGreaterThan(level);
			expect(Math.abs(needleTurn(edge, level + 1))).toBeLessThanOrEqual(1);
		}
	});

	it("holds its zoom inside the hysteresis band", () => {
		expect(zoomFor(0.5 * SCALES[2], 2)).toBe(2);
		expect(zoomFor(1.1 * SCALES[2], 2)).toBe(2);
	});

	it("gears the knob to the needle range", () => {
		expect(kelvinPerTurn(0)).toBe(1);
		expect(kelvinPerTurn(3)).toBe(0.001);
	});

	it("pegs the needle at the ends", () => {
		expect(needleTurn(5, 0)).toBe(1);
		expect(needleTurn(-5, 0)).toBe(-1);
		expect(needleTurn(0.5e-3, 3)).toBeCloseTo(0.5, 12);
	});

	it("a step at the finest zoom can land inside the match", () => {
		expect(SCALES[3] / 25).toBeLessThan(MATCH_K);
	});
});

group("readouts", () => {
	it("writes kelvin and celsius with a real minus sign", () => {
		expect(kelvin(T, 0)).toBe("2.73 K");
		expect(kelvin(T, 3)).toBe("2.72548 K");
		expect(celsius(T, 0)).toBe("−270.42 °C");
	});
});

group("matching", () => {
	it("needs the heater close and the sky quiet", () => {
		expect(isMatched(MATCH_K / 2, 0)).toBe(true);
		expect(isMatched(MATCH_K * 2, 0)).toBe(false);
		expect(isMatched(0, QUIET_K * 2)).toBe(false);
	});

	it("keeps a nearby match as the first and a far one as the second", () => {
		const first = match(ahead, T + 3.3e-3, 1);
		const again = match(vec(260, 45), T + 3.2e-3, 0.99);
		const far = match(behind, T - 3.3e-3, -1);
		let flow = record(START_FLOW, first);

		flow = record(flow, again);
		expect(flow.first).toBe(again);
		expect(flow.second).toBeNull();

		flow = record(flow, far);
		expect(flow.second).toBe(far);
	});

	it("turns two opposite matches into our speed", () => {
		const flow: Flow = {
			first: match(ahead, T + 3.3624e-3, 1),
			second: match(behind, T - 3.3624e-3, -1),
			other: true,
		};
		const v = speedOf(flow, fakeSpeed);

		expect(v).not.toBeNull();
		expect(v as number).toBeCloseTo(369.8, 0);
		expect(crossing(v as number)).toBeCloseTo(15.06, 1);
	});

	it("refuses a speed from two side-on spots", () => {
		const flow: Flow = {
			first: match(vec(175, 0), T, 0.05),
			second: match(vec(355, 0), T, -0.05),
			other: true,
		};

		expect(sideOn(flow)).toBe(true);
		expect(speedOf(flow, fakeSpeed)).toBeNull();
	});
});

group("captions", () => {
	const title = (c: Caption) => c.title;

	it("opens without repeating the page title", () => {
		const opening = describe(START_FLOW, reading(), null);

		expect(opening).toBe(OPENING);
		expect(opening.title).not.toMatch(/how cold is space/i);
	});

	it("says close when the needle is in reach", () => {
		expect(title(describe(START_FLOW, reading({ gap: 1e-3 }), null))).toBe(
			"Close.",
		);
	});

	it("names the temperature on the first match", () => {
		const flow = record(START_FLOW, match(ahead, T, 1));

		expect(title(describe(flow, reading({ matched: true }), null))).toBe(
			"−270.42 °C.",
		);
	});

	it("asks for the other side and keeps asking until it is matched", () => {
		const flow = { ...record(START_FLOW, match(ahead, T, 1)), other: true };

		expect(title(describe(flow, reading(), null))).toBe("Now the other side.");
		expect(title(describe(flow, reading({ matched: true }), null))).toBe(
			"Now the other side.",
		);
	});

	it("leads with the speed once both sides match", () => {
		const flow: Flow = {
			first: match(ahead, T + 3.3e-3, 1),
			second: match(behind, T - 3.3e-3, -1),
			other: true,
		};
		const c = describe(flow, reading({ matched: true }), 368.4);

		expect(c.title).toBe("368 km/s.");
		expect(c.body).toMatch(/0\.0066 degrees colder/);
		expect(c.body).toMatch(/Crater/);
	});

	it("explains the Milky Way when dust keeps the needle moving", () => {
		const c = describe(
			START_FLOW,
			reading({ gap: 1e-4, leftover: MILKY_K * 2 }),
			null,
		);

		expect(c.title).toBe("The Milky Way.");
	});
});

group("data on disk", () => {
	it("pins the viewer to the SDK that wrote the recording", () => {
		const pkg = JSON.parse(read("../../package.json"));
		const py = read("../../../../../cobe/pyproject.toml");

		expect(pkg.dependencies["@rerun-io/web-viewer"]).toBe(RERUN_VERSION);
		expect(py).toContain(`"rerun-sdk==${RERUN_VERSION}"`);
		expect(VIEWER_CDN).toContain(`@${RERUN_VERSION}/`);
	});

	it("names the recording and timeline the same on both sides", () => {
		const py = read("../../../../../cobe/src/cobe/record.py");

		expect(py).toContain(`RECORDING = "${RECORDING_ID}"`);
		expect(py).toContain(`TIMELINE = "${TIMELINE}"`);
	});

	it("ships a sky file the Rust reader expects", () => {
		const bytes = readFileSync(
			new URL("../../public/cobe/sky.bin", import.meta.url),
		);
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const count = view.getUint32(8, true);
		const freqs = view.getUint32(12, true);

		expect(bytes.subarray(0, 4).toString()).toBe("HCSK");
		expect(count).toBe(6144);
		expect(freqs).toBe(43);
		expect(view.getFloat64(16, true)).toBeCloseTo(T, 9);
		expect(bytes.byteLength).toBe(80 + freqs * 16 + count * (12 + 8 + 4 + 8));
	});

	it("carries the full FIRAS monopole spectrum", () => {
		expect(SPECTRUM).toHaveLength(43);
		expect(Math.max(...SPECTRUM.map((p) => p.sky))).toBeCloseTo(383.478, 3);
	});

	it("is experiment 18", () => {
		const e = experiments.find((x) => x.id === "how-cold-is-space");

		expect(e?.number).toBe(18);
		expect(e?.href).toBe("/experiments/how-cold-is-space");
	});
});
