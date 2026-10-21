export type Base = "A" | "C" | "G" | "T";

const COMPLEMENT: Record<string, string> = {
	A: "T",
	C: "G",
	G: "C",
	T: "A",
	N: "N",
};

export const complement = (base: string) => COMPLEMENT[base] ?? "N";

export const revcomp = (seq: string) => {
	let out = "";

	for (let i = seq.length - 1; i >= 0; i--) out += complement(seq[i]);

	return out;
};

export const transcribe = (seq: string) => seq.replace(/T/g, "U");

export const gc = (seq: string) => {
	let count = 0;

	for (const base of seq) if (base === "G" || base === "C") count++;

	return count;
};

const AMINO =
	"FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
const ORDER = "TCAG";

const CODONS = (() => {
	const table: Record<string, string> = {};
	let i = 0;

	for (const a of ORDER)
		for (const b of ORDER) for (const c of ORDER) table[a + b + c] = AMINO[i++];

	return table;
})();

export const codon = (triplet: string) => CODONS[triplet] ?? "?";

export interface Protein {
	residues: string;
	stop: number;
}

export function translate(seq: string): Protein {
	let residues = "";
	let stop = -1;

	for (let i = 0; i + 2 < seq.length; i += 3) {
		const amino = codon(seq.slice(i, i + 3));

		if (amino === "*") {
			stop = i / 3;
			break;
		}

		residues += amino;
	}

	return { residues, stop };
}

export const THREE: Record<string, string> = {
	A: "Ala",
	C: "Cys",
	D: "Asp",
	E: "Glu",
	F: "Phe",
	G: "Gly",
	H: "His",
	I: "Ile",
	K: "Lys",
	L: "Leu",
	M: "Met",
	N: "Asn",
	P: "Pro",
	Q: "Gln",
	R: "Arg",
	S: "Ser",
	T: "Thr",
	V: "Val",
	W: "Trp",
	Y: "Tyr",
	"*": "Ter",
};
