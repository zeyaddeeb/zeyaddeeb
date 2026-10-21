export interface Fact {
	value: string;
	note: string;
	source: string;
	href: string;
}

export const SHARES: Record<string, number> = {
	g12d: 27,
	g12v: 21,
	g13d: 17,
	g12c: 6,
};

export interface Measured {
	leak: number;
	guide: string;
}

export const MATCHED = 66;

export const LEAK: Record<string, Measured> = {
	g12d: { leak: 15, guide: "sgG12D" },
	g12v: { leak: 12, guide: "sgG12V" },
	g12c: { leak: 2, guide: "sgG12C" },
};

export const LEAK_SOURCE = {
	value: "",
	note: "Editing measured on wild-type KRAS in 293T cells by mutant-specific guides, against 66% for the guide that matches wild-type exactly. The guide written for wild-type still cut a G12S tumor copy at 40%, so the sparing does not run both ways.",
	source: "Gao et al., Theranostics 2020",
	href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7163449/",
} satisfies Fact;

export const SEED = {
	value: "positions 2 to 8",
	note: "from the PAM are the most mismatch-sensitive stretch. Position 1, hard against the PAM, is not among them — a single mismatch there is tolerated more often than one a little further along",
	source:
		"Rabinowitz and Offen, Molecular Therapy 2021, pooling six single-mismatch studies",
	href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7938333/",
} satisfies Fact;

export const FACTS = {
	krasShare: {
		value: "about 40%",
		note: "of colorectal cancers carry a KRAS mutation, rising to roughly 45% in metastatic cohorts",
		source:
			"TCGA COADREAD (218/534) and MSK-IMPACT metastatic CRC (495/1134), via cBioPortal",
		href: "https://www.cbioportal.org/",
	},
	codonShare: {
		value: "about 82%",
		note: "of KRAS mutations in colorectal cancer sit in codon 12 or 13",
		source: "npj Precision Oncology, 2025",
		href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12658183/",
	},
	synchronous: {
		value: "5.7%",
		note: "of colorectal cancers already show peritoneal metastases at diagnosis; a further 5.5% develop them within three years",
		source: "Netherlands Cancer Registry, 7,233 patients, BJS Open 2020",
		href: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7397359/",
	},
	prodige: {
		value: "41.7 vs 41.2 months",
		note: "median overall survival with and without oxaliplatin HIPEC after complete cytoreductive surgery, hazard ratio 1.00, p=0.99; late grade 3 or worse complications were more common with HIPEC, 26% vs 15%, p=0.035",
		source: "PRODIGE 7, Quénet et al., Lancet Oncology 2021, n=265",
		href: "https://doi.org/10.1016/S1470-2045(20)30599-4",
	},
	peritonealKras: {
		value: "61.5% vs 35.0%",
		note: "KRAS mutation in peritoneal metastases against an all-stage colorectal reference, p=0.0002; 82.6% of these patients were the mesenchymal CMS4 subtype",
		source: "Lenos et al., Nature Communications 2022, 52 patients",
		href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9352687/",
	},
	dependency: {
		value: "−1.55 against −0.51",
		note: "median Chronos gene-effect score for knocking out KRAS in KRAS-mutant colorectal cell lines (n=34) versus KRAS-wild-type ones (n=29), Mann–Whitney p=1.3×10⁻⁹. A score of −1 is the median of genes every cell needs",
		source: "computed from DepMap 24Q4 Public, CRISPRGeneEffect.csv",
		href: "https://doi.org/10.25452/figshare.plus.27993248.v1",
	},
	unedited: {
		value: "85%",
		note: "of tumor cells were still unedited six weeks after an adenoviral Cas9 was injected directly into the tumor; no fully edited cells were found in the tumors at all",
		source: "Martinez-Lage et al., Nature Communications 2020",
		href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7544871/",
	},
	compartment: {
		value: "10 to 1000 times",
		note: "the drug exposure inside the peritoneal cavity against the bloodstream when a drug is given into the cavity, depending on the agent; penetration into tissue is only millimetres, so it treats surfaces rather than bulk",
		source: "intraperitoneal pharmacology reviews, after Dedrick et al. 1978",
		href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1481500/",
	},
	trials: {
		value: "none",
		note: "registered trials deliver CRISPR into a solid tumor by direct injection. One trial proposes to reach tumor cells in the body at all, and it picked patients with liver metastases because that is where lipid nanoparticles already go",
		source:
			"ClinicalTrials.gov, searched 2026-10-20; EDB-102, NCT07461727, not yet recruiting",
		href: "https://clinicaltrials.gov/study/NCT07461727",
	},
	sotorasib: {
		value: "one",
		note: "KRAS-directed drug is approved in colorectal cancer: sotorasib with panitumumab, for G12C, approved 2025-01-16. The adagrasib combination was withdrawn on 2026-09-01 after its confirmatory trial missed both endpoints",
		source: "FDA withdrawn cancer accelerated approvals",
		href: "https://www.fda.gov/drugs/resources-information-approved-drugs/withdrawn-cancer-accelerated-approvals",
	},
	genome: {
		value: "3.1 billion",
		note: "letters in a human genome, against 4²⁰ ≈ 1.1 trillion possible twenty-letter words — which is why a guide is twenty letters long and not twelve",
		source: "GRCh38",
		href: "https://www.ncbi.nlm.nih.gov/datasets/genome/GCF_000001405.26/",
	},
	baseEdit: {
		value: "four of twelve",
		note: "An adenine base editor rewrites an A·T pair to G·C and a cytosine base editor does C·G to T·A, both with no double-strand break. Between them they cover the four transition changes but none of the eight transversions",
		source:
			"Komor et al., Nature 2016 (CBE); Gaudelli et al., Nature 2017 (ABE)",
		href: "https://doi.org/10.1038/nature24644",
	},
	pamFlex: {
		value: "NGG to NG",
		note: "engineered SpG and near-PAMless SpRY Cas9 relax the mark the editor has to find, which is what brings the codon 12 and 13 adenines inside a base editor's narrow activity window at all",
		source: "Walton et al., Science 2020",
		href: "https://doi.org/10.1126/science.aba8853",
	},
	primeEdit: {
		value: "all twelve",
		note: "point changes, plus small insertions and deletions, can be written by prime editing with no double-strand break and no donor. It nicks one strand and copies the edit from a template tethered to the editor",
		source: "Anzalone et al., Nature 2019",
		href: "https://doi.org/10.1038/s41586-019-1711-4",
	},
	secondNick: {
		value: "1.5- to 4.2-fold",
		note: "more editing when the other strand is nicked too, in four of five sites tested. Nicks about 40 to 90 bases from the first averaged 41% editing without excess indels, and the authors recommend starting around 50",
		source: "Anzalone et al., Nature 2019",
		href: "https://doi.org/10.1038/s41586-019-1711-4",
	},
	nickTooClose: {
		value: "6.8%",
		note: "indels came with even the best-placed second nick, and the pair stops being two nicks and starts being a break when they sit close together on opposite strands",
		source: "Anzalone et al., Nature 2019",
		href: "https://doi.org/10.1038/s41586-019-1711-4",
	},
} satisfies Record<string, Fact>;
