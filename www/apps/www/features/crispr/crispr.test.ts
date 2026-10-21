import { describe, expect, it } from "vitest";
import {
	backwards,
	discriminating,
	mutate,
	reachable,
	VARIANTS,
} from "./alleles";
import { revcomp, translate } from "./dna";
import { guideAt, guides, SPACER } from "./guides";
import { LOCUS } from "./locus-data";
import { spectrum } from "./repair";

const WINDOW = LOCUS.window.seq;

describe("locus", () => {
	it("holds the window it says it holds", () => {
		expect(WINDOW).toHaveLength(LOCUS.window.end - LOCUS.window.start + 1);
		expect(WINDOW).toMatch(/^[ACGT]+$/);
	});

	it("reads codon 12 and 13 of KRAS on the coding strand", () => {
		expect(WINDOW.slice(LOCUS.codon12, LOCUS.codon12 + 3)).toBe("GGT");
		expect(WINDOW.slice(LOCUS.codon13, LOCUS.codon13 + 3)).toBe("GGC");
	});

	it("translates to the known KRAS protein", () => {
		expect(LOCUS.protein).toHaveLength(189);
		expect(LOCUS.protein.startsWith("MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEY")).toBe(
			true,
		);
		expect(LOCUS.protein.endsWith("*")).toBe(true);
		expect(LOCUS.protein.indexOf("*")).toBe(188);
	});

	it("puts codon 12 where the reading frame says it is", () => {
		expect((LOCUS.codon12 - LOCUS.codingFrom) % 3).toBe(0);
		expect((LOCUS.codon12 - LOCUS.codingFrom) / 3).toBe(11);
	});
});

describe("guides", () => {
	it("cuts three bases from the PAM on the forward strand", () => {
		const seq = `${"A".repeat(10)}${"C".repeat(20)}TGG${"A".repeat(10)}`;
		const guide = guideAt(seq, 10, 1);

		expect(guide.spacer).toBe("C".repeat(20));
		expect(guide.pam).toBe("TGG");
		expect(guide.pamStart).toBe(30);
		expect(guide.cut).toBe(27);
	});

	it("mirrors the geometry on the reverse strand", () => {
		const seq = `${"A".repeat(10)}CCA${"G".repeat(20)}${"A".repeat(10)}`;
		const guide = guideAt(seq, 13, -1);

		expect(guide.pam).toBe("TGG");
		expect(guide.spacer).toBe(revcomp("G".repeat(20)));
		expect(guide.cut).toBe(16);
	});

	it("only finds sites that carry an NGG", () => {
		for (const guide of guides(WINDOW)) {
			expect(guide.pam.slice(1)).toBe("GG");
			expect(guide.spacer).toHaveLength(SPACER);
		}
	});
});

describe("repair", () => {
	it("reproduces the published microhomology example", () => {
		const found = spectrum(
			"GGAGGAAGGGCCTGAGTCCGAGCAGAAGAAGAAGGGCTCCCATCACATCAACCGGTGGCG",
			30,
		);

		expect(found.patterns).toHaveLength(44);
		expect(found.total).toBeCloseTo(4662.9, 1);
		expect(found.outOfFrame).toBeCloseTo(50.747, 3);
	});

	it("scores GC-rich microhomology above AT-rich of the same length", () => {
		const at = spectrum("TTTTTTTTTTATATTTTTTTTTTATAT", 14);
		const gc = spectrum("TTTTTTTTTTGCGCTTTTTTTTTTGCGC", 14);

		expect(gc.total).toBeGreaterThan(at.total);
	});

	it("counts a deletion that is a multiple of three as in frame", () => {
		const found = spectrum(
			"GGAGGAAGGGCCTGAGTCCGAGCAGAAGAAGAAGGGCTCCCATCACATCAACCGGTGGCG",
			30,
		);

		for (const pattern of found.patterns)
			expect(pattern.shifts).toBe(pattern.deletion % 3 !== 0);
	});
});

describe("telling the copies apart", () => {
	it("places every variant on the base it claims", () => {
		for (const variant of VARIANTS) {
			expect(WINDOW[variant.offset]).toBe(variant.from);
			expect(() => mutate(WINDOW, variant)).not.toThrow();
		}
	});

	it("finds no guide that cuts the tumor copy alone", () => {
		for (const variant of VARIANTS) {
			const over = reachable(mutate(WINDOW, variant), WINDOW, variant).filter(
				(verdict) => verdict.holds,
			);

			expect(over.length).toBeGreaterThan(0);
			expect(discriminating(over)).toHaveLength(0);
		}
	});

	it("finds exactly one guide that cuts the healthy copy alone", () => {
		for (const variant of VARIANTS) {
			const over = reachable(mutate(WINDOW, variant), WINDOW, variant).filter(
				(verdict) => verdict.holds,
			);
			const wrong = backwards(over);

			expect(wrong).toHaveLength(1);
			expect(wrong[0].onPam).toBe(true);
			expect(wrong[0].normal.pam.slice(1)).toBe("GG");
			expect(wrong[0].mutant.pam.slice(1)).not.toBe("GG");
		}
	});

	it("leaves the codon 12 guides one mismatch against the healthy copy", () => {
		const variant = VARIANTS.find((item) => item.label === "G12D");

		if (!variant) throw new Error("G12D is missing from the variants");

		const shared = reachable(mutate(WINDOW, variant), WINDOW, variant).filter(
			(verdict) => verdict.holds && verdict.only === "both",
		);

		expect(shared.length).toBeGreaterThan(0);

		for (const verdict of shared) {
			expect(verdict.normal.mismatches).toHaveLength(1);
			expect(verdict.fromPam).toBeGreaterThan(0);
		}
	});
});

describe("dna", () => {
	it("round-trips a reverse complement", () => {
		expect(revcomp(revcomp(WINDOW))).toBe(WINDOW);
	});

	it("translates a stop codon", () => {
		expect(translate("ATGTAA").residues).toBe("M");
		expect(translate("ATGTAA").stop).toBe(1);
	});
});
