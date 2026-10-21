import type { Variant } from "./alleles";
import { codon } from "./dna";
import { type Guide, guideAt, PAM, type Strand } from "./guides";
import { LOCUS } from "./locus-data";

export const WINDOW_LO = 4;
export const WINDOW_HI = 8;
export const REACH = 30;

export type Editor = "abe" | "cbe";
export type PamClass = "ngg" | "ng";
export type Strategy = "cut" | "rewrite" | "write";

export const EDITOR_LABEL: Record<Editor, string> = {
	abe: "adenine base editor",
	cbe: "cytosine base editor",
};

export const PAM_LABEL: Record<PamClass, string> = {
	ngg: "SpCas9 (NGG)",
	ng: "PAM-flexible (NG)",
};

const CODON = 3;

export const codingIndex = (guide: Guide, position: number) =>
	guide.strand === 1
		? guide.start + (position - 1)
		: guide.start + (WINDOW_SPAN - position);

const WINDOW_SPAN = 20;

export function convert(
	strand: Strand,
	editor: Editor,
	base: string,
): string | null {
	if (strand === 1) {
		if (editor === "abe" && base === "A") return "G";
		if (editor === "cbe" && base === "C") return "T";

		return null;
	}

	if (editor === "abe" && base === "T") return "C";
	if (editor === "cbe" && base === "G") return "A";

	return null;
}

const fitsPam = (pam: string, cls: PamClass) =>
	cls === "ngg" ? pam[1] === "G" && pam[2] === "G" : pam[1] === "G";

export function sites(seq: string, cls: PamClass): Guide[] {
	const found: Guide[] = [];

	for (let i = 0; i + WINDOW_SPAN + PAM <= seq.length; i++) {
		const guide = guideAt(seq, i, 1);

		if (fitsPam(guide.pam, cls)) found.push(guide);
	}

	for (let i = PAM; i + WINDOW_SPAN <= seq.length; i++) {
		const guide = guideAt(seq, i, -1);

		if (fitsPam(guide.pam, cls)) found.push(guide);
	}

	return found;
}

export interface Edit {
	position: number;
	index: number;
	from: string;
	to: string;
}

export function windowEdits(seq: string, guide: Guide, editor: Editor): Edit[] {
	const edits: Edit[] = [];

	for (let position = WINDOW_LO; position <= WINDOW_HI; position++) {
		const index = codingIndex(guide, position);

		if (index < 0 || index >= seq.length) continue;

		const to = convert(guide.strand, editor, seq[index]);

		if (to) edits.push({ position, index, from: seq[index], to });
	}

	return edits;
}

const applyEdits = (seq: string, edits: Edit[]) => {
	const letters = [...seq];

	for (const edit of edits) letters[edit.index] = edit.to;

	return letters.join("");
};

const codingEnd = LOCUS.exons[0].to;

export function exonProtein(seq: string) {
	let residues = "";

	for (let i = LOCUS.codingFrom; i + CODON <= codingEnd; i += CODON)
		residues += codon(seq.slice(i, i + CODON));

	return residues;
}

const WILD_TYPE = exonProtein(LOCUS.window.seq);

export interface BasePlan {
	possible: boolean;
	editor: Editor | null;
	pam: PamClass | null;
	guide: Guide | null;
	target: Edit | null;
	bystanders: Edit[];
	restores: boolean;
}

const EMPTY_BASE: BasePlan = {
	possible: false,
	editor: null,
	pam: null,
	guide: null,
	target: null,
	bystanders: [],
	restores: false,
};

export const windowSpan = (guide: Guide): readonly [number, number] => {
	const lo = codingIndex(guide, WINDOW_LO);
	const hi = codingIndex(guide, WINDOW_HI);

	return lo <= hi ? [lo, hi] : [hi, lo];
};

export interface BaseOption {
	guide: Guide;
	editor: Editor;
	pam: PamClass;
	target: Edit;
	bystanders: Edit[];
	restores: boolean;
	window: readonly [number, number];
}

export function baseSites(
	mutantSeq: string,
	variant: Variant,
	editor: Editor,
	pam: PamClass,
): BaseOption[] {
	const found: BaseOption[] = [];

	for (const guide of sites(mutantSeq, pam)) {
		const edits = windowEdits(mutantSeq, guide, editor);
		const target = edits.find((edit) => edit.index === variant.offset);

		if (!target || target.to !== variant.from) continue;

		found.push({
			guide,
			editor,
			pam,
			target,
			bystanders: edits.filter((edit) => edit.index !== variant.offset),
			restores: exonProtein(applyEdits(mutantSeq, edits)) === WILD_TYPE,
			window: windowSpan(guide),
		});
	}

	return found.sort(
		(a, b) =>
			Number(b.restores) - Number(a.restores) ||
			a.bystanders.length - b.bystanders.length ||
			a.guide.cut - b.guide.cut,
	);
}

export function baseOptions(mutantSeq: string, variant: Variant): BaseOption[] {
	for (const pam of ["ngg", "ng"] as PamClass[])
		for (const editor of ["abe", "cbe"] as Editor[]) {
			const found = baseSites(mutantSeq, variant, editor, pam);

			if (found.length) return found;
		}

	return [];
}

export function baseCorrect(mutantSeq: string, variant: Variant): BasePlan {
	const best = baseOptions(mutantSeq, variant)[0];

	if (!best) return EMPTY_BASE;

	return {
		possible: true,
		editor: best.editor,
		pam: best.pam,
		guide: best.guide,
		target: best.target,
		bystanders: best.bystanders,
		restores: best.restores,
	};
}

export interface PrimePlan {
	possible: boolean;
	guide: Guide | null;
	nick: number | null;
	distance: number | null;
	wrote: { from: string; to: string } | null;
	options: number;
}

export interface PrimeOption {
	guide: Guide;
	nick: number;
	distance: number;
}

export function primeOptions(
	normalSeq: string,
	variant: Variant,
): PrimeOption[] {
	const found: PrimeOption[] = [];

	for (const guide of sites(normalSeq, "ngg")) {
		const distance = Math.abs(guide.cut - variant.offset);

		if (distance > REACH) continue;

		found.push({ guide, nick: guide.cut, distance });
	}

	return found.sort(
		(a, b) => a.distance - b.distance || a.guide.cut - b.guide.cut,
	);
}

export function primeWrite(normalSeq: string, variant: Variant): PrimePlan {
	const found = primeOptions(normalSeq, variant);
	const best = found[0];

	if (!best)
		return {
			possible: false,
			guide: null,
			nick: null,
			distance: null,
			wrote: null,
			options: 0,
		};

	return {
		possible: true,
		guide: best.guide,
		nick: best.nick,
		distance: best.distance,
		wrote: { from: variant.to, to: variant.from },
		options: found.length,
	};
}

export const NICK_LO = 40;
export const NICK_HI = 90;

export type NickBand = "close" | "good" | "far";

export interface SecondNick {
	guide: Guide;
	nick: number;
	distance: number;
	band: NickBand;
}

const bandOf = (distance: number): NickBand =>
	distance < NICK_LO ? "close" : distance <= NICK_HI ? "good" : "far";

export function secondNicks(seq: string, first: Guide): SecondNick[] {
	const found: SecondNick[] = [];

	for (const guide of sites(seq, "ngg")) {
		if (guide.strand === first.strand) continue;

		const distance = Math.abs(guide.cut - first.cut);

		if (!distance) continue;

		found.push({
			guide,
			nick: guide.cut,
			distance,
			band: bandOf(distance),
		});
	}

	return found.sort((a, b) => a.distance - b.distance);
}

export const appliedSeq = (mutantSeq: string, option: BaseOption) =>
	applyEdits(mutantSeq, [option.target, ...option.bystanders]);
