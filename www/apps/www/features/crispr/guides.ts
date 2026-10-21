import { revcomp } from "./dna";

export const SPACER = 20;
export const PAM = 3;
export const BLUNT = 3;

export type Strand = 1 | -1;

export interface Guide {
	strand: Strand;
	start: number;
	end: number;
	spacer: string;
	pam: string;
	cut: number;
	pamStart: number;
}

export function guideAt(seq: string, start: number, strand: Strand): Guide {
	if (strand === 1) {
		const pamStart = start + SPACER;

		return {
			strand,
			start,
			end: start + SPACER - 1,
			spacer: seq.slice(start, start + SPACER),
			pam: seq.slice(pamStart, pamStart + PAM),
			cut: start + SPACER - BLUNT,
			pamStart,
		};
	}

	const pamStart = start - PAM;

	return {
		strand,
		start,
		end: start + SPACER - 1,
		spacer: revcomp(seq.slice(start, start + SPACER)),
		pam: revcomp(seq.slice(pamStart, pamStart + PAM)),
		cut: start + BLUNT,
		pamStart,
	};
}

const canonical = (pam: string) => pam[1] === "G" && pam[2] === "G";

export const weakPam = (pam: string) => pam[1] === "A" && pam[2] === "G";

export function guides(seq: string): Guide[] {
	const found: Guide[] = [];

	for (let i = 0; i + SPACER + PAM <= seq.length; i++) {
		const guide = guideAt(seq, i, 1);

		if (canonical(guide.pam)) found.push(guide);
	}

	for (let i = PAM; i + SPACER <= seq.length; i++) {
		const guide = guideAt(seq, i, -1);

		if (canonical(guide.pam)) found.push(guide);
	}

	return found.sort((a, b) => a.cut - b.cut || a.strand - b.strand);
}

export function nearest(list: Guide[], cut: number, strand?: Strand) {
	let best: Guide | null = null;
	let gap = Number.POSITIVE_INFINITY;

	for (const guide of list) {
		if (strand && guide.strand !== strand) continue;

		const distance = Math.abs(guide.cut - cut);

		if (distance < gap) {
			gap = distance;
			best = guide;
		}
	}

	return best;
}

export const spans = (guide: Guide) => ({
	protospacer: [guide.start, guide.end] as const,
	pam: [guide.pamStart, guide.pamStart + PAM - 1] as const,
});

export function seedOrder(guide: Guide) {
	const steps: number[] = [];

	for (let i = 0; i < SPACER; i++)
		steps.push(guide.strand === 1 ? guide.end - i : guide.start + i);

	return steps;
}
