import SNAPSHOT from "./snapshot.json";

type Verdict = "held up" | "reversed" | "unresolved" | "no call";

export interface Pair {
	cancer: string;
	biomarker: string;
	drugClass: string;
	gene: number;
	row: number;
	dish: {
		effect: number;
		sd: number;
		sensitizes: number;
		lines: number;
		lineage: boolean;
		confident: boolean;
	};
	bedside: {
		logHazard: number;
		sd: number;
		benefit: number;
		marked: number;
		unmarked: number;
	};
	verdict: Verdict;
	label: boolean;
	primary: boolean;
}

export interface Mosaic {
	cancer: string;
	genes: string[];
	classes: string[];
	tested: number;
	pairs: Pair[];
}

interface MosaicSource {
	genes: readonly string[];
	classes: readonly string[];
	tested: number;
	cells: readonly (readonly number[])[];
}

type Tone = "help" | "hurt";

const CANCERS: Record<string, string> = {
	"Non-Small Cell Lung Cancer": "Lung",
	"Breast Cancer": "Breast",
	"Colorectal Cancer": "Colorectal",
	"Pancreatic Cancer": "Pancreas",
	"Prostate Cancer": "Prostate",
};

const CLASSES: Record<string, string> = {
	egfr_tki: "EGFR pills",
	alk_tki: "ALK pills",
	aromatase: "Aromatase inhibitors",
	cdk46: "CDK4/6 inhibitors",
	her2: "HER2 drugs",
	pi3k: "Alpelisib",
	parp: "PARP inhibitors",
	platinum: "Platinum",
	taxane: "Taxanes",
	antimetabolite: "Antimetabolites",
	topoisomerase: "Topoisomerase drugs",
	anthracycline: "Anthracyclines",
	antiandrogen: "Antiandrogens",
	serd: "Fulvestrant",
	tamoxifen: "Tamoxifen",
};

const MARKERS: Record<string, [string, string]> = {
	egfr_activating: ["EGFR", "activating"],
	kras_nras: ["KRAS/NRAS", "hotspot"],
	braf_v600e: ["BRAF", "V600E"],
	stk11: ["STK11", "loss"],
	keap1: ["KEAP1", "mutated"],
	rb1_loss: ["RB1", "loss"],
	brca: ["BRCA1/2", "loss"],
	erbb2_amp: ["HER2", "amplified"],
	erbb2_mutant: ["HER2", "mutated"],
	pik3ca: ["PIK3CA", "mutated"],
	alk_fusion: ["ALK", "fusion"],
};

const VERDICT_CODES: Verdict[] = [
	"no call",
	"held up",
	"reversed",
	"unresolved",
];

export const VERDICTS: Record<Verdict, string> = {
	"held up": "Held up",
	reversed: "Reversed",
	unresolved: "Can’t tell",
	"no call": "No call",
};

const STEPS = [0.8, 0.9, 0.95];

const Z = 1.959964;

type Cell = readonly number[];

function decode(
	cancer: string,
	genes: readonly string[],
	classes: readonly string[],
	cell: Cell,
): Pair {
	const at = (i: number) => cell[i] ?? 0;
	const gene = at(0);
	const row = at(1);

	return {
		cancer,
		biomarker: genes[gene] ?? "",
		drugClass: classes[row] ?? "",
		gene,
		row,
		dish: {
			effect: at(2),
			sd: at(3),
			sensitizes: at(4),
			lines: at(5),
			lineage: at(6) === 1,
			confident: at(7) === 1,
		},
		bedside: {
			logHazard: at(8),
			sd: at(9),
			benefit: at(10),
			marked: at(11),
			unmarked: at(12),
		},
		verdict: VERDICT_CODES[at(13)] ?? "no call",
		label: at(14) === 1,
		primary: at(15) === 1,
	};
}

function toMosaics(source: Record<string, MosaicSource>): Mosaic[] {
	return Object.entries(source).map(([cancer, m]) => ({
		cancer,
		genes: [...m.genes],
		classes: [...m.classes],
		tested: m.tested,
		pairs: m.cells.map((cell) => decode(cancer, m.genes, m.classes, cell)),
	}));
}

export const MOSAICS: Mosaic[] = toMosaics(SNAPSHOT.mosaic);

export async function loadEvery(): Promise<Mosaic[]> {
	const response = await fetch("/bedside/genes.json");

	if (!response.ok) throw new Error(String(response.status));

	const body = (await response.json()) as {
		mosaic: Record<string, MosaicSource>;
	};

	return toMosaics(body.mosaic);
}

const geneOf = (biomarker: string) =>
	biomarker.startsWith("altered:") ? biomarker.slice(8) : "";

export function matches(biomarker: string, sought: string): boolean {
	const wanted = sought.trim().toUpperCase();

	if (!wanted) return false;

	const shown = markerParts(biomarker)[0].toUpperCase();

	return shown === wanted || geneOf(biomarker).toUpperCase() === wanted;
}

export const ALL_PAIRS = MOSAICS.flatMap((m) => m.pairs);

const GENE_NAMES: Record<string, string> = { ERBB2: "HER2" };

const geneName = (gene: string) => GENE_NAMES[gene] ?? gene;

export function markerParts(biomarker: string): [string, string] {
	if (biomarker.startsWith("altered:")) {
		return [geneName(biomarker.slice(8)), "any"];
	}

	return MARKERS[biomarker] ?? [biomarker, ""];
}

export const markerName = (biomarker: string) => markerParts(biomarker)[0];

export function longMarker(biomarker: string): string {
	const [gene, kind] = markerParts(biomarker);

	return kind === "any" ? `${gene} altered` : `${gene} ${kind}`.trim();
}

export const className = (drugClass: string) => CLASSES[drugClass] ?? drugClass;

export function inSentence(drugClass: string): string {
	const name = className(drugClass);

	return /^[A-Z]{2}/.test(name)
		? name
		: name.charAt(0).toLowerCase() + name.slice(1);
}

export const cancerName = (cancer: string) => CANCERS[cancer] ?? cancer;

export const sure = (probability: number) =>
	Math.max(probability, 1 - probability);

export function step(probability: number): number {
	const certainty = sure(probability);

	return STEPS.filter((s) => certainty >= s).length;
}

export const dishTone = (p: Pair): Tone =>
	p.dish.sensitizes >= 0.5 ? "help" : "hurt";

export const bedsideTone = (p: Pair): Tone =>
	p.bedside.benefit >= 0.5 ? "help" : "hurt";

export function hazardInterval(p: Pair): [number, number, number] {
	const { logHazard, sd } = p.bedside;

	return [
		Math.exp(logHazard - Z * sd),
		Math.exp(logHazard),
		Math.exp(logHazard + Z * sd),
	];
}

export function dishInterval(p: Pair): [number, number, number] {
	const { effect, sd } = p.dish;

	return [effect - Z * sd, effect, effect + Z * sd];
}

export function dishWords(p: Pair): string {
	const way = p.dish.effect < 0 ? "more" : "less";
	const lines = p.dish.lineage
		? `${p.dish.lines} ${cancerName(p.cancer).toLowerCase()} lines carry it`
		: `too few ${cancerName(p.cancer).toLowerCase()} lines carry it, so this leans on other cancers’ lines`;

	return `Cell lines with ${longMarker(p.biomarker)} were ${way} sensitive to ${inSentence(p.drugClass)} than to the other drugs; ${lines}.`;
}

export function bedsideWords(p: Pair): string {
	const [, hazard] = hazardInterval(p);
	const way = hazard < 1 ? "stayed on" : "came off";
	const timing = hazard < 1 ? "longer" : "sooner";

	return `Patients with it ${way} ${inSentence(p.drugClass)} ${timing} than on the other drugs (hazard ${hazard.toFixed(2)}), over ${p.bedside.marked} treatment courses with it and ${p.bedside.unmarked} without.`;
}

export function verdictWords(p: Pair): string {
	if (p.verdict === "held up") return "The bedside agrees with the dish.";

	if (p.verdict === "reversed") return "The bedside points the other way.";

	if (p.verdict === "unresolved") {
		return "The dish was sure; the patient record cannot tell either way.";
	}

	return "The dish made no confident call here.";
}

export const title = (p: Pair) =>
	`${longMarker(p.biomarker)} · ${className(p.drugClass)} · ${cancerName(p.cancer)}`;

export function counts(pairs: readonly Pair[]) {
	const called = pairs.filter((p) => p.dish.confident);

	return {
		called: called.length,
		held: called.filter((p) => p.verdict === "held up").length,
		reversed: called.filter((p) => p.verdict === "reversed").length,
		unresolved: called.filter((p) => p.verdict === "unresolved").length,
	};
}

const FAMILIES: { name: string; classes: string[] }[] = [
	{
		name: "Targeted",
		classes: ["egfr_tki", "alk_tki", "her2", "pi3k", "cdk46", "parp"],
	},
	{
		name: "Hormone",
		classes: ["aromatase", "serd", "tamoxifen", "antiandrogen"],
	},
	{
		name: "Chemo",
		classes: [
			"platinum",
			"taxane",
			"antimetabolite",
			"topoisomerase",
			"anthracycline",
		],
	},
];

const SHORT: Record<string, string> = {
	egfr_tki: "EGFR pills",
	alk_tki: "ALK pills",
	her2: "HER2 drugs",
	pi3k: "Alpelisib",
	cdk46: "CDK4/6",
	parp: "PARP",
	aromatase: "Aromatase",
	serd: "Fulvestrant",
	tamoxifen: "Tamoxifen",
	antiandrogen: "AR blockers",
	platinum: "Platinum",
	taxane: "Taxanes",
	antimetabolite: "Antimetab.",
	topoisomerase: "Topoisom.",
	anthracycline: "Anthracycl.",
};

export const shortName = (drugClass: string) =>
	SHORT[drugClass] ?? className(drugClass);

export const GROUPS = FAMILIES;

export const COLUMNS = GROUPS.flatMap((g) => g.classes);

export const ROWS = 12;

function interest(pairs: readonly Pair[]): [number, number] {
	return [
		pairs.filter((p) => p.dish.confident).length,
		Math.max(0, ...pairs.map((p) => sure(p.dish.sensitizes))),
	];
}

export function rowsOf(pairs: readonly Pair[]): string[] {
	const byGene = new Map<string, Pair[]>();

	for (const p of pairs) {
		byGene.set(p.biomarker, [...(byGene.get(p.biomarker) ?? []), p]);
	}

	return [...byGene.entries()]
		.map(([gene, found]) => ({ gene, score: interest(found) }))
		.sort(
			(a, b) =>
				b.score[0] - a.score[0] ||
				b.score[1] - a.score[1] ||
				a.gene.localeCompare(b.gene),
		)
		.map((r) => r.gene);
}

export const pairsOf = (pairs: readonly Pair[], biomarker: string) =>
	pairs
		.filter((p) => p.biomarker === biomarker)
		.sort(
			(a, b) => COLUMNS.indexOf(a.drugClass) - COLUMNS.indexOf(b.drugClass),
		);

const RANK: Record<Verdict, number> = {
	"held up": 0,
	reversed: 1,
	unresolved: 2,
	"no call": 3,
};

export const findingsOf = (pairs: readonly Pair[]) =>
	pairs
		.filter((p) => p.dish.confident)
		.sort(
			(a, b) =>
				RANK[a.verdict] - RANK[b.verdict] ||
				sure(b.dish.sensitizes) - sure(a.dish.sensitizes),
		);

export const SUMMARY = SNAPSHOT.translation;
export const GATE = SNAPSHOT.gate;
export const VERSION = SNAPSHOT.version;
