import { existsSync } from "node:fs";
import { expect, describe as group, it } from "vitest";
import { experiments } from "../catalog/catalog";
import {
	ALL_PAIRS,
	COLUMNS,
	counts,
	GROUPS,
	hazardInterval,
	inSentence,
	longMarker,
	MOSAICS,
	markerName,
	matches,
	ROWS,
	rowsOf,
	step,
	sure,
} from "./model";

group("shipped data", () => {
	it("never shows a group smaller than 15", () => {
		for (const p of ALL_PAIRS) {
			expect(p.bedside.marked).toBeGreaterThanOrEqual(15);
			expect(p.bedside.unmarked).toBeGreaterThanOrEqual(15);
		}
	});

	it("keeps every verdict consistent with its probabilities", () => {
		for (const p of ALL_PAIRS) {
			if (!p.dish.confident) {
				expect(p.verdict).toBe("no call");
				continue;
			}

			expect(sure(p.dish.sensitizes)).toBeGreaterThanOrEqual(0.95);

			const agree =
				p.dish.sensitizes >= 0.5 ? p.bedside.benefit : 1 - p.bedside.benefit;

			if (p.verdict === "held up") expect(agree).toBeGreaterThanOrEqual(0.95);
			if (p.verdict === "reversed") expect(agree).toBeLessThanOrEqual(0.05);
			if (p.verdict === "unresolved") {
				expect(agree).toBeGreaterThan(0.05);
				expect(agree).toBeLessThan(0.95);
			}
		}
	});

	it("places every square inside its mosaic", () => {
		for (const m of MOSAICS) {
			const seen = new Set<string>();

			for (const p of m.pairs) {
				expect(p.gene).toBeLessThan(m.genes.length);
				expect(p.row).toBeLessThan(m.classes.length);
				expect(m.genes[p.gene]).toBe(p.biomarker);
				expect(m.classes[p.row]).toBe(p.drugClass);

				const key = `${p.gene}|${p.row}`;

				expect(seen.has(key)).toBe(false);
				seen.add(key);
			}
		}
	});

	it("matches the recorded result", () => {
		expect(counts(ALL_PAIRS)).toEqual({
			called: 73,
			held: 5,
			reversed: 2,
			unresolved: 66,
		});
	});
});

group("reading a square", () => {
	it("steps certainty the way the key says", () => {
		expect(step(0.5)).toBe(0);
		expect(step(0.79)).toBe(0);
		expect(step(0.85)).toBe(1);
		expect(step(0.92)).toBe(2);
		expect(step(0.97)).toBe(3);
		expect(step(0.03)).toBe(3);
	});

	it("names markers for the axis and the sheet", () => {
		expect(markerName("altered:TP53")).toBe("TP53");
		expect(longMarker("altered:TP53")).toBe("TP53 altered");
		expect(markerName("egfr_activating")).toBe("EGFR");
		expect(longMarker("egfr_activating")).toBe("EGFR activating");
		expect(longMarker("erbb2_amp")).toBe("HER2 amplified");
	});

	it("puts the hazard ratio inside its interval", () => {
		for (const p of ALL_PAIRS) {
			const [low, mid, high] = hazardInterval(p);

			expect(low).toBeLessThanOrEqual(mid);
			expect(mid).toBeLessThanOrEqual(high);
		}
	});
});

group("layout", () => {
	it("gives every cancer the same columns, in families", () => {
		expect(COLUMNS).toHaveLength(15);
		expect(GROUPS.map((g) => g.name)).toEqual(["Targeted", "Hormone", "Chemo"]);
		expect(new Set(COLUMNS).size).toBe(COLUMNS.length);

		for (const p of ALL_PAIRS) expect(COLUMNS).toContain(p.drugClass);
	});

	it("orders every gene once, sure calls first", () => {
		for (const m of MOSAICS) {
			const rows = rowsOf(m.pairs);

			expect(new Set(rows).size).toBe(rows.length);
			expect(new Set(rows)).toEqual(new Set(m.pairs.map((p) => p.biomarker)));
			expect(rows.length).toBeGreaterThanOrEqual(ROWS);

			const sure = (b: string) =>
				m.pairs.filter((p) => p.biomarker === b && p.dish.confident).length;

			for (let i = 1; i < rows.length; i++) {
				expect(sure(rows[i - 1] ?? "")).toBeGreaterThanOrEqual(
					sure(rows[i] ?? ""),
				);
			}
		}
	});

	it("keeps acronyms when a drug name sits mid-sentence", () => {
		expect(inSentence("egfr_tki")).toBe("EGFR pills");
		expect(inSentence("her2")).toBe("HER2 drugs");
		expect(inSentence("taxane")).toBe("taxanes");
		expect(inSentence("pi3k")).toBe("alpelisib");
	});

	it("finds HER2 under either name", () => {
		expect(matches("altered:ERBB2", "her2")).toBe(true);
		expect(matches("altered:ERBB2", "ERBB2")).toBe(true);
		expect(matches("erbb2_amp", "HER2")).toBe(true);
		expect(matches("altered:TP53", "")).toBe(false);
	});
});

group("catalog", () => {
	it("lists the experiment with a page behind it", () => {
		const entry = experiments.find((e) => e.id === "lost-in-translation");

		expect(entry?.number).toBe(19);
		expect(
			existsSync(
				new URL(
					"../../app/(site)/experiments/lost-in-translation/page.tsx",
					import.meta.url,
				),
			),
		).toBe(true);
	});
});
