import SNAPSHOT from "./snapshot.json";

export type Verdict = "held up" | "reversed" | "unresolved" | "no call";

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

export interface MosaicSource {
	genes: readonly string[];
	classes: readonly string[];
	tested: number;
	cells: readonly (readonly number[])[];
}

export type Tone = "help" | "hurt";

export const CANCERS: Record<string, string> = {
	"Non-Small Cell Lung Cancer": "Lung",
	"Breast Cancer": "Breast",
	"Colorectal Cancer": "Colorectal",
	"Pancreatic Cancer": "Pancreas",
	"Prostate Cancer": "Prostate",
};

export const CLASSES: Record<string, string> = {
	checkpoint: "Immunotherapy",
	egfr_tki: "EGFR pills",
	alk_tki: "ALK pills",
	aromatase: "Aromatase inhibitors",
	cdk46: "CDK4/6 inhibitors",
	her2: "HER2 drugs",
	pi3k: "Alpelisib",
	parp: "PARP inhibitors",
	egfr_antibody: "EGFR antibodies",
	platinum: "Platinum",
	taxane: "Taxanes",
	antimetabolite: "Antimetabolites",
	topoisomerase: "Topoisomerase drugs",
	anthracycline: "Anthracyclines",
	vegf: "VEGF blockers",
	antiandrogen: "Antiandrogens",
	serd: "Fulvestrant",
	tamoxifen: "Tamoxifen",
};

const MARKERS: Record<string, string> = {
	egfr_activating: "EGFR mut",
	kras_nras: "KRAS/NRAS",
	braf_v600e: "BRAF V600E",
	stk11: "STK11 loss",
	keap1: "KEAP1",
	esr1_lbd: "ESR1 mut",
	rb1_loss: "RB1 loss",
	brca: "BRCA loss",
	erbb2_amp: "HER2 amp",
	erbb2_mutant: "HER2 mut",
	pik3ca: "PIK3CA mut",
	alk_fusion: "ALK fusion",
	ros1_fusion: "ROS1 fusion",
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

export const STEPS = [0.8, 0.9, 0.95];

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

export function toMosaics(source: Record<string, MosaicSource>): Mosaic[] {
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

export const geneOf = (biomarker: string) =>
	biomarker.startsWith("altered:") ? biomarker.slice(8) : "";

export const ALL_PAIRS = MOSAICS.flatMap((m) => m.pairs);

export const markerName = (biomarker: string) =>
	biomarker.startsWith("altered:")
		? biomarker.slice(8)
		: (MARKERS[biomarker] ?? biomarker);

export const longMarker = (biomarker: string) =>
	biomarker.startsWith("altered:")
		? `${biomarker.slice(8)} altered`
		: (MARKERS[biomarker] ?? biomarker);

export const className = (drugClass: string) => CLASSES[drugClass] ?? drugClass;

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

	return `Cell lines with ${longMarker(p.biomarker)} were ${way} sensitive to ${className(p.drugClass).toLowerCase()} than to the other drugs; ${lines}.`;
}

export function bedsideWords(p: Pair): string {
	const [, hazard] = hazardInterval(p);
	const way = hazard < 1 ? "stayed on" : "came off";
	const timing = hazard < 1 ? "longer" : "sooner";

	return `Patients with it ${way} ${className(p.drugClass).toLowerCase()} ${timing} than on the other drugs (hazard ${hazard.toFixed(2)}), over ${p.bedside.marked} treatment courses with it and ${p.bedside.unmarked} without.`;
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

export const SUMMARY = SNAPSHOT.translation;
export const GATE = SNAPSHOT.gate;
export const VERSION = SNAPSHOT.version;
export const LEDGER = SNAPSHOT.ledger;
