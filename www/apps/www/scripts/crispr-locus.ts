import { writeFileSync } from "node:fs";

const GENE = "KRAS";
const TRANSCRIPT = "ENST00000311936";
const POOL = { chromosome: "12", start: 25204000, end: 25252000 };
const WINDOW = { start: 25245250, end: 25245450 };
const EXPECTED = "MTEYKLVVVGAGGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAG";
const REST = "https://rest.ensembl.org";

const COMPLEMENT: Record<string, string> = { A: "T", C: "G", G: "C", T: "A" };
const revcomp = (seq: string) =>
	[...seq]
		.reverse()
		.map((base) => COMPLEMENT[base])
		.join("");

const AMINO =
	"FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG";
const ORDER = "TCAG";
const CODONS: Record<string, string> = {};
let slot = 0;

for (const a of ORDER)
	for (const b of ORDER)
		for (const c of ORDER) CODONS[a + b + c] = AMINO[slot++];

const translate = (seq: string) => {
	let out = "";

	for (let i = 0; i + 2 < seq.length; i += 3)
		out += CODONS[seq.slice(i, i + 3)];

	return out;
};

async function ask<T>(path: string): Promise<T> {
	const response = await fetch(`${REST}${path}`, {
		headers: { "content-type": "application/json" },
	});

	if (!response.ok) throw new Error(`${path} returned ${response.status}`);

	return (await response.json()) as T;
}

interface Exon {
	start: number;
	end: number;
}

interface Transcript {
	id: string;
	strand: number;
	seq_region_name: string;
	Exon: Exon[];
	Translation: { start: number; end: number };
}

interface Region {
	seq: string;
	id: string;
}

interface Release {
	releases: number[];
}

const release = await ask<Release>("/info/data?content-type=application/json");
const tx = await ask<Transcript>(
	`/lookup/id/${TRANSCRIPT}?content-type=application/json;expand=1`,
);

if (tx.strand !== -1)
	throw new Error(`${GENE} is no longer on the minus strand`);

const pool = await ask<Region>(
	`/sequence/region/homo_sapiens/${POOL.chromosome}:${POOL.start}..${POOL.end}:1?content-type=application/json`,
);

if (pool.seq.length !== POOL.end - POOL.start + 1)
	throw new Error("pool length does not match the request");

if (/[^ACGT]/.test(pool.seq))
	throw new Error("pool holds a base that is not ACGT");

const forward = (from: number, to: number) =>
	pool.seq.slice(from - POOL.start, to - POOL.start + 1);

const coding = (from: number, to: number) => revcomp(forward(from, to));

const { start: cdsEnd, end: cdsStart } = tx.Translation;
const pieces = [...tx.Exon]
	.sort((a, b) => b.start - a.start)
	.map((exon) => ({
		start: Math.max(exon.start, cdsEnd),
		end: Math.min(exon.end, cdsStart),
	}))
	.filter((piece) => piece.start <= piece.end);

const cds = pieces.map((piece) => coding(piece.start, piece.end)).join("");

if (cds.length % 3 !== 0)
	throw new Error("the CDS is not a whole number of codons");

const protein = translate(cds);

if (!protein.startsWith(EXPECTED))
	throw new Error(`translated ${GENE} does not match the known protein`);

if (protein.indexOf("*") !== protein.length - 1)
	throw new Error("the CDS holds an early stop");

const codonAt = (n: number) => cdsStart - (n - 1) * 3;

const codon12 = codonAt(12);
const codon13 = codonAt(13);

if (coding(codon12 - 2, codon12) !== "GGT")
	throw new Error("codon 12 is not GGT");

if (coding(codon13 - 2, codon13) !== "GGC")
	throw new Error("codon 13 is not GGC");

const window = {
	start: WINDOW.start,
	end: WINDOW.end,
	seq: coding(WINDOW.start, WINDOW.end),
};

const at = (position: number) => window.end - position;

const exons = [...tx.Exon]
	.sort((a, b) => b.start - a.start)
	.map((exon, index) => ({
		number: index + 1,
		from: at(Math.min(exon.end, WINDOW.end)),
		to: at(Math.max(exon.start, WINDOW.start)),
	}))
	.filter((exon) => exon.to >= 0 && exon.from <= window.seq.length - 1);

const codingFrom = at(Math.min(cdsStart, WINDOW.end));

const out = `export interface Marker {
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

export const LOCUS: Locus = ${JSON.stringify(
	{
		gene: GENE,
		transcript: tx.id,
		chromosome: tx.seq_region_name,
		assembly: "GRCh38",
		release: release.releases[0],
		fetched: new Date().toISOString().slice(0, 10),
		strand: -1,
		window,
		exons,
		codon12: at(codon12),
		codon13: at(codon13),
		codingFrom,
		protein,
	},
	null,
	1,
)};
`;

writeFileSync(
	new URL("../features/crispr/locus-data.ts", import.meta.url),
	out,
);

console.log(
	`${GENE} ${tx.id} chr${tx.seq_region_name} ${protein.length - 1} aa, window ${window.seq.length} bp, pool ${pool.seq.length} bp, codon 12 at offset ${at(codon12)}, Ensembl ${release.releases[0]}`,
);
