export interface Marker {
	number: number;
	from: number;
	to: number;
}

export interface Locus {
	gene: string;
	transcript: string;
	chromosome: string;
	assembly: string;
	release: number;
	fetched: string;
	strand: -1;
	window: { start: number; end: number; seq: string };
	exons: Marker[];
	codon12: number;
	codon13: number;
	codingFrom: number;
	protein: string;
}

export const LOCUS: Locus = {
	gene: "KRAS",
	transcript: "ENST00000311936",
	chromosome: "12",
	assembly: "GRCh38",
	release: 116,
	fetched: "2026-10-19",
	strand: -1,
	window: {
		start: 25245250,
		end: 25245450,
		seq: "ACCTTATGTGTGACATGTTCTAATATAGTCACATTTTCATTATTTTTATTATAAGGCCTGCTGAAAATGACTGAATATAAACTTGTGGTAGTTGGAGCTGGTGGCGTAGGCAAGAGTGCCTTGACGATACAGCTAATTCAGAATCATTTTGTGGACGAATATGATCCAACAATAGAGGTAAATCTTGTTTTAATATGCATA",
	},
	exons: [
		{
			number: 2,
			from: 55,
			to: 176,
		},
	],
	codon12: 99,
	codon13: 102,
	codingFrom: 66,
	protein:
		"MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHHYREQIKRVKDSEDVPMVLVGNKCDLPSRTVDTKQAQDLARSYGIPFIETSAKTRQGVDDAFYTLVREIRKHKEKMSKDGKKKKKKSKTKCVIM*",
};
