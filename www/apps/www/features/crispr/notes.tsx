import { Note } from "@/features/frame/note";
import { FACTS, LEAK_SOURCE, SEED } from "./facts";
import { LOCUS } from "./locus-data";

function sources(...cited: string[]) {
	return [...new Set(cited)].join("; ");
}

export function Notes() {
	return (
		<div className="notes-grid">
			<Note title="Sequence and target" wide open>
				<p>
					The bench loads {LOCUS.window.seq.length} bases of human {LOCUS.gene}{" "}
					from {LOCUS.assembly} chromosome {LOCUS.chromosome} (
					{LOCUS.window.start.toLocaleString()}–
					{LOCUS.window.end.toLocaleString()}, Ensembl release {LOCUS.release}
					), reverse-complemented onto the coding strand and verified against
					the {LOCUS.protein.length - 1}-residue protein sequence.{" "}
					{FACTS.krasShare.value} {FACTS.krasShare.note}, and{" "}
					{FACTS.codonShare.value} {FACTS.codonShare.note}.
				</p>
			</Note>

			<Note title="PAM orientation at codons 12 and 13">
				<p>
					Allele-specific Cas9 knockout works cleanly when a somatic mutation
					creates a new NGG PAM on the tumor allele. At KRAS codons 12 and 13,
					the wild-type coding sequence (<code>…GCT GGT GGC…</code>) already
					carries the GG dinucleotides. Every common hotspot mutation here
					destroys a wild-type PAM and creates none, so PAM-only discrimination
					cuts the healthy allele and spares the tumor copy.
				</p>
				<p className="notes-source">
					{sources(FACTS.krasShare.source, FACTS.codonShare.source)}
				</p>
			</Note>

			<Note title="Single-base mismatches in the seed region">
				<p>
					Without a mutant-specific PAM, a guide targeting the mutant allele
					shares its PAM with wild-type KRAS and differs by one spacer base.
					Cas9 is most sensitive to mismatches at {SEED.value} from the PAM,
					whereas position 1 immediately adjacent to the PAM is more permissive.
					G12D and G12V place the mismatch at position 1 and cut 12–15% of
					wild-type alleles in 293T cells; G12C places it at position 2 and cuts
					2–3% (against 66% on a matched target).
				</p>
				<p className="notes-source">
					{sources(SEED.source, LEAK_SOURCE.source)}
				</p>
			</Note>

			<Note title="Microhomology-mediated end joining">
				<p>
					Double-strand breaks repaired without a donor template often delete
					the sequence between flanking microhomologies. The repair panel
					enumerates flanking repeats and scores each deletion using Bae et
					al.’s formula, <code>100 × exp(−L/20) × (bases + GC bases)</code>,
					reporting the out-of-frame share from deletions whose length is not a
					multiple of three (verified against the paper’s 44-pattern benchmark:
					score 4662.9, out-of-frame 50.747).
				</p>
				<p className="notes-source">
					Bae, Kweon, Kim and Kim, Nature Methods 2014
				</p>
			</Note>

			<Note title="Base editing">
				<p>
					Adenine and cytosine base editors deaminate a single strand within a
					narrow activity window without making a double-strand break, covering
					the {FACTS.baseEdit.value} transition mutations (A↔G, C↔T). G12D and
					G13D are G→A coding transitions that an adenine base editor can revert
					directly to wild-type G, making any action on the healthy allele a
					synonymous G→G no-op. Reaching codon 12 requires a relaxed PAM variant
					({FACTS.pamFlex.value}), while G12V and G12C are G→T transversions
					outside base-editor chemistry.
				</p>
				<p className="notes-source">
					{sources(FACTS.baseEdit.source, FACTS.pamFlex.source)}
				</p>
			</Note>

			<Note title="Prime editing">
				<p>
					Prime editors nick one strand and reverse-transcribe a replacement
					from a pegRNA template, covering {FACTS.primeEdit.value} point
					mutations, including G12V and G12C, using a canonical NGG site. Adding
					a second nick on the opposite strand (PE3) increases editing{" "}
					{FACTS.secondNick.value} when placed 40–90 bp away, but nicks placed
					too close together act like a double-strand break and reintroduce
					indels ({FACTS.nickTooClose.value} even at optimal spacing).
				</p>
				<p className="notes-source">
					{sources(FACTS.primeEdit.source, FACTS.secondNick.source)}
				</p>
			</Note>

			<Note title="Delivery and clinical constraints">
				<p>
					In DepMap CRISPR knockout screens, KRAS-mutant colorectal lines show a
					median Chronos score of {FACTS.dependency.value} vs. wild-type lines.
					However, <em>in vivo</em> delivery remains the bottleneck: after
					direct intratumoral adenoviral Cas9 injection, {FACTS.unedited.value}{" "}
					of tumor cells remained unedited at six weeks, and{" "}
					{FACTS.compartment.value} intraperitoneal drug exposure penetrates
					only millimeters into solid nodules (PRODIGE 7: {FACTS.prodige.value}{" "}
					median survival with vs. without oxaliplatin HIPEC). Nothing on this
					page is medical advice.
				</p>
				<p className="notes-source">
					{sources(
						FACTS.dependency.source,
						FACTS.unedited.source,
						FACTS.compartment.source,
						FACTS.prodige.source,
					)}
				</p>
			</Note>
		</div>
	);
}
