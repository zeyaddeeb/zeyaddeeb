import { describe, expect, it } from "vitest";
import { mutate, VARIANTS, variantOf } from "./alleles";
import {
	baseCorrect,
	baseOptions,
	baseSites,
	codingIndex,
	convert,
	exonProtein,
	NICK_HI,
	NICK_LO,
	primeOptions,
	primeWrite,
	REACH,
	secondNicks,
	WINDOW_HI,
	WINDOW_LO,
	windowEdits,
	windowSpan,
} from "./editing";
import { guideAt } from "./guides";
import { LOCUS } from "./locus-data";

const WINDOW = LOCUS.window.seq;

describe("editing geometry", () => {
	it("numbers the editing window from the PAM-distal end", () => {
		const guide = guideAt(WINDOW, 40, 1);

		expect(codingIndex(guide, 1)).toBe(40);
		expect(codingIndex(guide, 20)).toBe(59);
	});

	it("mirrors the window on the reverse strand", () => {
		const guide = guideAt(WINDOW, 40, -1);

		expect(codingIndex(guide, 1)).toBe(59);
		expect(codingIndex(guide, 20)).toBe(40);
	});

	it("only deaminates the base each editor recognises", () => {
		expect(convert(1, "abe", "A")).toBe("G");
		expect(convert(1, "cbe", "C")).toBe("T");
		expect(convert(1, "abe", "C")).toBeNull();
		expect(convert(-1, "abe", "T")).toBe("C");
		expect(convert(-1, "cbe", "G")).toBe("A");
	});

	it("keeps the window five letters wide", () => {
		expect(WINDOW_HI - WINDOW_LO + 1).toBe(5);
	});
});

describe("base editing corrects only the transitions", () => {
	it("reverts G12D and G13D to wild-type with one clean edit", () => {
		for (const id of ["g12d", "g13d"]) {
			const variant = variantOf(id);
			const plan = baseCorrect(mutate(WINDOW, variant), variant);

			expect(plan.possible).toBe(true);
			expect(plan.editor).toBe("abe");
			expect(plan.restores).toBe(true);
			expect(plan.bystanders).toHaveLength(0);
			expect(plan.target?.index).toBe(variant.offset);
			expect(plan.target?.to).toBe(variant.from);
		}
	});

	it("needs a PAM-flexible editor, not plain SpCas9, to reach codon 12", () => {
		const variant = variantOf("g12d");
		const plan = baseCorrect(mutate(WINDOW, variant), variant);

		expect(plan.pam).toBe("ng");
	});

	it("cannot correct the transversions G12V and G12C", () => {
		for (const id of ["g12v", "g12c"]) {
			const variant = variantOf(id);
			const plan = baseCorrect(mutate(WINDOW, variant), variant);

			expect(plan.possible).toBe(false);
		}
	});
});

describe("prime editing can write every variant back", () => {
	it("finds a canonical nick within reach of each mutation", () => {
		for (const variant of VARIANTS) {
			const plan = primeWrite(WINDOW, variant);

			expect(plan.possible).toBe(true);
			expect(plan.distance).not.toBeNull();
			expect(plan.distance as number).toBeLessThanOrEqual(REACH);
			expect(plan.wrote).toEqual({ from: variant.to, to: variant.from });
		}
	});
});

describe("the exon translation is anchored", () => {
	it("reads glycine at codons 12 and 13 on the wild-type window", () => {
		const protein = exonProtein(WINDOW);

		expect(protein[11]).toBe("G");
		expect(protein[12]).toBe("G");
	});

	it("shows the mutant residue before correction", () => {
		const variant = variantOf("g12d");

		expect(exonProtein(mutate(WINDOW, variant))[11]).toBe("D");
	});

	it("leaves no window edit on a guide that has no substrate", () => {
		const guide = guideAt("A".repeat(23), 0, 1);

		expect(windowEdits("A".repeat(23), guide, "cbe")).toHaveLength(0);
	});
});

describe("the bench offers the sites it finds", () => {
	it("finds nothing at codon 12 with plain SpCas9", () => {
		const variant = variantOf("g12d");

		expect(baseSites(mutate(WINDOW, variant), variant, "abe", "ngg")).toEqual(
			[],
		);
	});

	it("finds sites once the PAM is relaxed", () => {
		const variant = variantOf("g12d");
		const found = baseSites(mutate(WINDOW, variant), variant, "abe", "ng");

		expect(found.length).toBeGreaterThan(0);

		for (const option of found) {
			expect(option.target.index).toBe(variant.offset);
			expect(option.target.to).toBe(variant.from);
			expect(option.window[0]).toBeLessThanOrEqual(variant.offset);
			expect(option.window[1]).toBeGreaterThanOrEqual(variant.offset);
		}
	});

	it("finds nothing with the wrong deaminase", () => {
		const variant = variantOf("g12d");

		expect(baseSites(mutate(WINDOW, variant), variant, "cbe", "ng")).toEqual(
			[],
		);
	});

	it("leads with the same site baseCorrect picks", () => {
		const variant = variantOf("g12d");
		const mutant = mutate(WINDOW, variant);
		const best = baseOptions(mutant, variant)[0];

		expect(best.guide).toEqual(baseCorrect(mutant, variant).guide);
	});

	it("keeps the window five letters wide wherever it lands", () => {
		const variant = variantOf("g13d");

		for (const option of baseSites(
			mutate(WINDOW, variant),
			variant,
			"abe",
			"ng",
		))
			expect(option.window[1] - option.window[0] + 1).toBe(
				WINDOW_HI - WINDOW_LO + 1,
			);
	});

	it("mirrors the window span on either strand", () => {
		for (const strand of [1, -1] as const) {
			const span = windowSpan(guideAt(WINDOW, 40, strand));

			expect(span[0]).toBeLessThan(span[1]);
		}
	});

	it("offers several nicking sites, nearest first", () => {
		for (const variant of VARIANTS) {
			const found = primeOptions(WINDOW, variant);

			expect(found.length).toBeGreaterThan(1);
			expect(found[0].distance).toBe(primeWrite(WINDOW, variant).distance);

			for (const option of found)
				expect(option.distance).toBeLessThanOrEqual(REACH);

			for (let i = 1; i < found.length; i++)
				expect(found[i].distance).toBeGreaterThanOrEqual(found[i - 1].distance);
		}
	});
});

describe("the second nick is the break in disguise", () => {
	it("only offers the strand the pegRNA did not nick", () => {
		for (const variant of VARIANTS) {
			const first = primeOptions(WINDOW, variant)[0];

			for (const option of secondNicks(WINDOW, first.guide))
				expect(option.guide.strand).not.toBe(first.guide.strand);
		}
	});

	it("sorts by distance and never offers a zero gap", () => {
		const first = primeOptions(WINDOW, variantOf("g12d"))[0];
		const found = secondNicks(WINDOW, first.guide);

		expect(found.length).toBeGreaterThan(1);

		for (let i = 1; i < found.length; i++)
			expect(found[i].distance).toBeGreaterThanOrEqual(found[i - 1].distance);

		for (const option of found) expect(option.distance).toBeGreaterThan(0);
	});

	it("bands the gap the way the paper does", () => {
		const first = primeOptions(WINDOW, variantOf("g12d"))[0];

		for (const option of secondNicks(WINDOW, first.guide)) {
			if (option.distance < NICK_LO) expect(option.band).toBe("close");
			else if (option.distance <= NICK_HI) expect(option.band).toBe("good");
			else expect(option.band).toBe("far");
		}
	});

	it("offers a gap on both sides of the recommended band", () => {
		const first = primeOptions(WINDOW, variantOf("g12d"))[0];
		const bands = secondNicks(WINDOW, first.guide).map((o) => o.band);

		expect(bands).toContain("close");
		expect(bands).toContain("good");
	});
});
