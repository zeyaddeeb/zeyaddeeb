import { gc } from "./dna";

export const LENGTH_WEIGHT = 20;
export const SHORTEST = 2;

export interface Pattern {
	leftStart: number;
	leftEnd: number;
	rightStart: number;
	rightEnd: number;
	homology: string;
	deletion: number;
	score: number;
	shifts: boolean;
}

export interface Spectrum {
	patterns: Pattern[];
	total: number;
	outOfFrame: number;
}

const factor = (deletion: number) =>
	Math.round(1000 / Math.exp(deletion / LENGTH_WEIGHT)) / 1000;

function covered(pattern: Pattern, ref: Pattern) {
	if (pattern.leftStart < ref.leftStart) return false;
	if (pattern.leftEnd > ref.leftEnd) return false;
	if (pattern.rightStart < ref.rightStart) return false;
	if (pattern.rightEnd > ref.rightEnd) return false;

	return (
		pattern.leftStart - ref.leftStart === pattern.rightStart - ref.rightStart &&
		pattern.leftEnd - ref.leftEnd === pattern.rightEnd - ref.rightEnd
	);
}

export function spectrum(seq: string, cut: number): Spectrum {
	const left = cut;
	const right = seq.length - cut;
	const kept: Pattern[] = [];

	for (let k = left - 1; k >= SHORTEST; k--)
		for (let j = left; j <= left + right - k; j++)
			for (let i = 0; i <= left - k; i++) {
				const homology = seq.slice(i, i + k);

				if (homology !== seq.slice(j, j + k)) continue;

				const deletion = j - i;
				const pattern: Pattern = {
					leftStart: i,
					leftEnd: i + k - 1,
					rightStart: j,
					rightEnd: j + k - 1,
					homology,
					deletion,
					score: 100 * factor(deletion) * (k + gc(homology)),
					shifts: deletion % 3 !== 0,
				};

				if (kept.some((ref) => covered(pattern, ref))) continue;

				kept.push(pattern);
			}

	let total = 0;
	let shifted = 0;

	for (const pattern of kept) {
		total += pattern.score;
		if (pattern.shifts) shifted += pattern.score;
	}

	return {
		patterns: kept,
		total,
		outOfFrame: total > 0 ? (shifted * 100) / total : 0,
	};
}

export const likeliest = (found: Spectrum, many: number) =>
	[...found.patterns].sort((a, b) => b.score - a.score).slice(0, many);

export const share = (found: Spectrum, pattern: Pattern) =>
	found.total > 0 ? pattern.score / found.total : 0;

export function applied(seq: string, pattern: Pattern) {
	return seq.slice(0, pattern.leftEnd + 1) + seq.slice(pattern.rightEnd + 1);
}
