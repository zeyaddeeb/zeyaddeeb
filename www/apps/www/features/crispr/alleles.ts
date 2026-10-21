import { type Guide, guideAt, PAM, SPACER } from "./guides";
import { LOCUS } from "./locus-data";

export interface Variant {
	id: string;
	label: string;
	codon: 12 | 13;
	offset: number;
	from: string;
	to: string;
	was: string;
	now: string;
}

export type Side = "mutant" | "normal";

export type Strength = "full" | "partial" | "blocked";

export interface Reading {
	pam: string;
	pamOk: boolean;
	spacer: string;
	mismatches: number[];
	cut: Strength;
}

export type Only = "mutant" | "normal" | "both" | "neither";

export interface Verdict {
	guide: Guide;
	mutant: Reading;
	normal: Reading;
	only: Only;
	fromPam: number | null;
	onPam: boolean;
	holds: boolean;
	from: Side;
}

const CODON = 3;

export const VARIANTS: Variant[] = [
	{
		id: "g12d",
		label: "G12D",
		codon: 12,
		offset: LOCUS.codon12 + 1,
		from: "G",
		to: "A",
		was: "Gly",
		now: "Asp",
	},
	{
		id: "g12v",
		label: "G12V",
		codon: 12,
		offset: LOCUS.codon12 + 1,
		from: "G",
		to: "T",
		was: "Gly",
		now: "Val",
	},
	{
		id: "g12c",
		label: "G12C",
		codon: 12,
		offset: LOCUS.codon12,
		from: "G",
		to: "T",
		was: "Gly",
		now: "Cys",
	},
	{
		id: "g13d",
		label: "G13D",
		codon: 13,
		offset: LOCUS.codon13 + 1,
		from: "G",
		to: "A",
		was: "Gly",
		now: "Asp",
	},
];

export const variantOf = (id: string) =>
	VARIANTS.find((variant) => variant.id === id) ?? VARIANTS[0];

export function mutate(seq: string, variant: Variant) {
	if (seq[variant.offset] !== variant.from)
		throw new Error(`${variant.label} does not sit on a ${variant.from}`);

	return (
		seq.slice(0, variant.offset) + variant.to + seq.slice(variant.offset + 1)
	);
}

export const codonSpan = (variant: Variant) => {
	const start = variant.codon === 12 ? LOCUS.codon12 : LOCUS.codon13;

	return [start, start + CODON - 1] as const;
};

const valid = (pam: string) => pam[1] === "G" && pam[2] === "G";

function read(seq: string, guide: Guide): Reading {
	const here = guideAt(seq, guide.start, guide.strand);
	const mismatches: number[] = [];

	for (let i = 0; i < SPACER; i++)
		if (here.spacer[i] !== guide.spacer[i]) mismatches.push(SPACER - i);

	const pamOk = valid(here.pam);

	return {
		pam: here.pam,
		pamOk,
		spacer: here.spacer,
		mismatches,
		cut: !pamOk ? "blocked" : mismatches.length === 0 ? "full" : "partial",
	};
}

const cuts = (reading: Reading) => reading.cut !== "blocked";

export function judge(
	mutantSeq: string,
	normalSeq: string,
	guide: Guide,
	variant: Variant,
): Verdict {
	const mutant = read(mutantSeq, guide);
	const normal = read(normalSeq, guide);

	let only: Only = "neither";

	if (cuts(mutant) && cuts(normal)) only = "both";
	else if (cuts(mutant)) only = "mutant";
	else if (cuts(normal)) only = "normal";

	const apart = mutant.mismatches.concat(normal.mismatches);
	const onPam =
		variant.offset >= guide.pamStart && variant.offset < guide.pamStart + PAM;

	return {
		guide,
		mutant,
		normal,
		only,
		fromPam: apart.length ? Math.min(...apart) : null,
		onPam,
		holds:
			onPam || (variant.offset >= guide.start && variant.offset <= guide.end),
		from: "mutant",
	};
}

export function candidates(seq: string) {
	const found: Guide[] = [];

	for (let i = 0; i + SPACER + PAM <= seq.length; i++) {
		const guide = guideAt(seq, i, 1);

		if (valid(guide.pam)) found.push(guide);
	}

	for (let i = PAM; i + SPACER <= seq.length; i++) {
		const guide = guideAt(seq, i, -1);

		if (valid(guide.pam)) found.push(guide);
	}

	return found.sort((a, b) => a.cut - b.cut || a.strand - b.strand);
}

export function reachable(
	mutantSeq: string,
	normalSeq: string,
	variant: Variant,
): Verdict[] {
	const seen = new Map<string, Verdict>();
	const sides: [Side, string][] = [
		["mutant", mutantSeq],
		["normal", normalSeq],
	];

	for (const [side, seq] of sides)
		for (const guide of candidates(seq)) {
			const key = `${guide.strand}:${guide.start}`;

			if (seen.has(key)) continue;

			seen.set(key, {
				...judge(mutantSeq, normalSeq, guide, variant),
				from: side,
			});
		}

	return [...seen.values()].sort(
		(a, b) => a.guide.cut - b.guide.cut || a.guide.strand - b.guide.strand,
	);
}

export const discriminating = (list: Verdict[]) =>
	list.filter((verdict) => verdict.only === "mutant");

export const backwards = (list: Verdict[]) =>
	list.filter((verdict) => verdict.only === "normal");
