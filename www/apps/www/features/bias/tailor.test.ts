import { describe, expect, it } from "vitest";
import { DRESSED, fitOf } from "./atelier";
import { FORMS, type FormId, formOf } from "./forms";
import { grainAt, type Press } from "./net";
import { RECORDS } from "./records-data";
import {
	bestFor,
	CAPTIONS,
	caption,
	fewest,
	laid,
	PRESETS,
	type Preset,
} from "./story";

const fit = (preset: Pick<Preset, "fill" | "sewn">, form: FormId = "ball") =>
	fitOf({ form, fill: preset.fill, sewn: preset.sewn, loose: null }).fit;

const [chebyshev, ghys, turned] = PRESETS.ball;

describe("the known cuts", () => {
	it("splits Chebyshev's ball into two halves", () => {
		const result = fit(chebyshev);

		expect(result.coverage).toBeGreaterThan(0.9995);
		expect(result.cuts[0].covered).toBeCloseTo(0.5, 2);
		expect(result.cuts[1].covered).toBeCloseTo(0.5, 2);
		expect(result.cloth).toBeCloseTo(1.08, 2);
	});

	it("dresses the whole ball in Ghys's one piece", () => {
		expect(fit(ghys).coverage).toBeGreaterThan(0.9995);
	});

	it("leaves a tenth bare with thick thread unless one half is turned", () => {
		const aligned = fit({
			fill: turned.fill,
			sewn: [turned.sewn[0], { ...turned.sewn[1], warp: [1, 0, 0] }],
		});

		expect(aligned.coverage).toBeGreaterThan(0.89);
		expect(aligned.coverage).toBeLessThan(0.91);
		expect(fit(turned).coverage).toBeGreaterThan(0.999);
	});

	it("covers the saddle in one piece only along its dips and rises", () => {
		const saddle = formOf("saddle");
		const along = PRESETS.saddle[0];
		const across: Press = {
			pin: [0, 0, 0],
			warp: grainAt(saddle, [0, 0, 0], Math.PI / 4),
		};

		expect(fit(along, "saddle").coverage).toBeGreaterThan(DRESSED);
		expect(
			fit({ fill: along.fill, sewn: [across] }, "saddle").coverage,
		).toBeLessThan(0.9);
	});

	it("dresses every form with each preset it offers", () => {
		for (const form of FORMS)
			for (const preset of PRESETS[form])
				expect(fit(preset, form).coverage).toBeGreaterThan(DRESSED);
	});
});

describe("the fewest found", () => {
	it("keeps every saved layout dressed", () => {
		for (const form of FORMS)
			for (const record of RECORDS[form]) {
				const result = fit(
					{ fill: record.fill, sewn: laid(form, record.layout) },
					form,
				);

				expect(record.layout).toHaveLength(record.pieces);
				expect(result.coverage).toBeGreaterThanOrEqual(DRESSED);
			}
	});

	it("never needs fewer pieces for thicker thread", () => {
		for (const form of FORMS) {
			const counts = RECORDS[form].map((r) => r.pieces);

			expect(counts).toEqual([...counts].sort((a, b) => a - b));
		}
	});

	it("pins the counts the notes and captions quote", () => {
		expect(RECORDS.ball.map((r) => r.pieces)).toEqual([1, 2, 2, 2, 3, 4]);
		expect(bestFor("ball", 0.8).pieces).toBe(2);
		expect(bestFor("ball", 0.81).pieces).toBe(3);
	});
});

describe("captions", () => {
	const longest = Math.max(...CAPTIONS.map((c) => c.length));

	it("reserves room for every caption the lab can show", () => {
		for (const form of FORMS)
			for (const fill of [0, 0.37, 0.9])
				for (const sewn of [0, 1, 7])
					for (const loose of [false, true])
						for (const coverage of [0.42, 1])
							for (const best of [1, 8])
								expect(
									caption({
										form,
										fill,
										sewn,
										loose,
										coverage,
										preset: null,
										best,
									}).length,
								).toBeLessThanOrEqual(longest);

		for (const form of FORMS)
			for (const fill of [0, 0.5, 0.9])
				expect(fewest(form, fill).caption.length).toBeLessThanOrEqual(longest);
	});
});
