import { FACTS, LEAK_SOURCE, SEED } from "./facts";
import { LOCUS } from "./locus-data";
import { Note } from "./note";
import "./notes.css";

function sources(...cited: string[]) {
	return [...new Set(cited)].join("; ");
}

export function Notes() {
	return (
		<div className="cr-notes">
			<section className="cr-note cr-note--lead">
				<p className="cr-note__number">01</p>
				<div>
					<h3>What the bench is doing</h3>
					<p>
						A tumor and the patient it grew in differ, at this spot, by one
						letter. Cas9 is often described as a pair of scissors, but it is
						closer to a reader that will only open a book where it finds a
						particular three-letter mark, the PAM. Everything here follows from
						that: whether a cut is possible at all, whether the two copies can
						be told apart, and what the cell writes back afterwards.
					</p>
				</div>
			</section>

			<div className="cr-notes__grid">
				<Note number="02" title="The sequence is real" open>
					<p>
						The letters on the bench are {LOCUS.window.seq.length} bases of{" "}
						{LOCUS.gene} read from {LOCUS.assembly} chromosome{" "}
						{LOCUS.chromosome}, positions {LOCUS.window.start.toLocaleString()}–
						{LOCUS.window.end.toLocaleString()}, taken from Ensembl release{" "}
						{LOCUS.release} and shown on the coding strand. {LOCUS.gene} sits on
						the minus strand, so the letters you read are the reverse complement
						of the forward genome. The build script translates the whole coding
						sequence and refuses to emit a file unless it comes out as the known{" "}
						{LOCUS.protein.length - 1}-residue KRAS protein and codon 12 reads
						GGT.
					</p>
				</Note>

				<Note number="03" title="Why KRAS, and why this cancer">
					<p>
						<strong>{FACTS.krasShare.value}</strong> {FACTS.krasShare.note}, and{" "}
						{FACTS.codonShare.value} {FACTS.codonShare.note}
						—which is why the bench opens on codon 12. Peritoneal metastasis is
						the setting because it is where a locally delivered editor is even
						thinkable. {FACTS.synchronous.value} {FACTS.synchronous.note}.
					</p>
					<p className="cr-note__source">
						{sources(
							FACTS.krasShare.source,
							FACTS.codonShare.source,
							FACTS.synchronous.source,
						)}
					</p>
				</Note>

				<Note number="04" title="The PAM runs the wrong way here">
					<p>
						A mutation that <em>creates</em> a PAM is the clean case for
						allele-specific editing: the tumor copy can be opened and the
						healthy copy simply cannot. At KRAS codons 12 and 13 the opposite
						happens. The wild-type sequence reads …GCT <strong>GGT GGC</strong>
						…, and those GG pairs are themselves PAMs. Every common mutation
						here destroys one and creates none, so the only guide that can tell
						the copies apart by PAM alone is the one that cuts the patient and
						spares the cancer. Try each variant: the count in the ledger stays
						at zero.
					</p>
				</Note>

				<Note number="05" title="So you are left with one letter">
					<p>
						With no PAM to separate them, a mutant-specific guide shares its PAM
						with the healthy copy and differs from it by a single mismatch. How
						well that works depends on where the mismatch falls: {SEED.value}{" "}
						{SEED.note}.
					</p>
					<p>
						That is exactly the trap at codon 12. G12D and G12V put the mismatch
						at position 1; G12C puts it at position 2. When these guides were
						measured in cells, the position-1 guides cut <strong>12–15%</strong>{" "}
						of healthy copies and the position-2 guides <strong>2–3%</strong>.
						The most common variant in this cancer is the hardest one to target
						cleanly.
					</p>
					<p className="cr-note__source">
						{sources(SEED.source, LEAK_SOURCE.source)}
					</p>
				</Note>

				<Note number="06" title="The sparing does not run both ways">
					<p>{LEAK_SOURCE.note}</p>
					<p className="cr-note__source">{LEAK_SOURCE.source}</p>
				</Note>

				<Note number="07" title="Why a guide is twenty letters">
					<p>
						There are {FACTS.genome.value} {FACTS.genome.note}. On the non-N
						primary assembly that is about 5.9 billion places a twenty-letter
						word could start, against 1.1 trillion possible words, so a given
						twenty-letter match is expected roughly once in 186 genomes — and
						once in about 3,000 when you also demand a PAM. That argument
						explains why a <em>perfect</em> match is nearly unique. It says
						nothing about near matches, which is where real off-target cutting
						lives, and why this page does not pretend to run a genome-wide
						search.
					</p>
					<p className="cr-note__source">{FACTS.genome.source}</p>
				</Note>

				<Note number="08" title="What the cell writes back">
					<p>
						Cas9 makes a break; it does not type a replacement. When the two
						ends are rejoined, short repeats that happen to sit on either side
						of the cut can pair up, and everything between them is lost. The
						repair panel enumerates those repeats and scores each resulting
						deletion with the published microhomology formula: a pattern score
						of 100 × e^(−L/20) × (bases + GC bases), summed, with the
						out-of-frame score being the share of that total belonging to
						deletions whose length is not a multiple of three.
					</p>
					<p>
						The implementation here reproduces the authors&rsquo; own worked
						example exactly — 44 patterns, a microhomology score of 4662.9 and
						an out-of-frame score of 50.747 — and a test pins those numbers.
					</p>
					<p className="cr-note__source">
						Bae, Kweon, Kim and Kim, Nature Methods 2014
					</p>
				</Note>

				<Note number="09" title="So stop cutting — change the letter">
					<p>
						If the break is the problem, the newest editors do not make one. A
						base editor carries a deaminase that chemically rewrites a single
						letter in place: an adenine editor turns A into G, a cytosine editor
						turns C into T. At G12D and G13D the mutation is exactly a G→A on
						the coding strand, so an adenine editor pointed at that letter
						writes the healthy G straight back — no double-strand break, no
						repair lottery. Switch the bench to <em>Rewrite the letter</em> and
						the window, the editor and the single swap are all computed from the
						same real sequence.
					</p>
					<p>
						The catch is chemistry. A base editor only runs{" "}
						<strong>{FACTS.baseEdit.value}</strong> point changes — the
						transitions. {FACTS.baseEdit.note}. G12V and G12C are G→T
						transversions, so no base editor can touch them; the bench says so.
						And reaching codon 12 needs a relaxed PAM, {FACTS.pamFlex.value},{" "}
						{FACTS.pamFlex.note}.
					</p>
					<p className="cr-note__source">
						{sources(FACTS.baseEdit.source, FACTS.pamFlex.source)}
					</p>
				</Note>

				<Note number="10" title="When the fix is just the healthy allele">
					<p>
						Something quietly important happens once the correction lands. The
						whole first half of this bench is about{" "}
						<em>telling the two copies apart</em>, because a nuclease that cuts
						the healthy copy does damage. But if the edit turns the tumor copy
						into the wild-type letter, then doing the exact same edit to the
						healthy copy changes a G into a G. It is a no-op. The
						allele-specificity problem does not get solved so much as it stops
						existing — there is nothing harmful left to do to the wrong copy.
					</p>
				</Note>

				<Note number="11" title="Or write it back, letter for letter">
					<p>
						Prime editing is the general case. It nicks one strand near the
						mutation and copies a new sequence in from a template tethered to
						the editor, with no double-strand break and no donor — so it can
						write <strong>{FACTS.primeEdit.value}</strong> point changes, plus
						small insertions and deletions, including the G12V and G12C
						transversions a base editor cannot. On the bench, under{" "}
						<em>Write it back</em>, a canonical NGG nick sits within reach of
						every variant here, and the edit is always the exact wild-type
						codon.
					</p>
					<p>
						There is a way to make it work harder, and it comes with the
						page&rsquo;s own moral attached. Nicking the <em>other</em> strand
						as well raises editing <strong>{FACTS.secondNick.value}</strong>{" "}
						{FACTS.secondNick.note}. But two nicks close together on opposite
						strands are a double-strand break under another name, and the
						scramble from the first half of this bench comes back with them.
						Switch <em>Write it back</em> to <em>Nick both strands</em> and
						drag: the bench marks every second site that falls inside the
						recommended band, and every one that sits too near.
					</p>
					<p>
						So why is this page not a cure? Because specificity was never the
						last wall. Prime editors are large, their efficiency in real tissue
						is modest, and getting enough editor into enough cells is the
						unsolved part — the same delivery problem note 15 ends on. The
						chemistry caught up; the plumbing has not.
					</p>
					<p className="cr-note__source">
						{sources(FACTS.primeEdit.source, FACTS.secondNick.source)}
					</p>
				</Note>

				<Note number="12" title="Knocking out KRAS does hurt these cells">
					<p>
						This is not hypothetical. In genome-wide CRISPR knockout screens,{" "}
						<strong>{FACTS.dependency.value}</strong> is the{" "}
						{FACTS.dependency.note}.
					</p>
					<p>
						Two honest caveats. The wild-type median is −0.51, not zero, so
						plenty of KRAS-wild-type lines need KRAS too; this is a shift in a
						distribution, not a switch. And the effect tracks the genotype
						rather than the tissue — the all-lineage figure is essentially the
						same.
					</p>
					<p className="cr-note__source">{FACTS.dependency.source}</p>
				</Note>

				<Note number="13" title="Why the peritoneum at all">
					<p>
						The peritoneum is a bag you can fill. Filling it buys{" "}
						{FACTS.compartment.value} {FACTS.compartment.note}. That is a real
						pharmacological argument for treating this compartment locally, and
						it is the reason the idea is placed here rather than anywhere else
						in the body.
					</p>
					<p className="cr-note__source">{FACTS.compartment.source}</p>
				</Note>

				<Note number="14" title="And why that argument has limits">
					<p>
						Heating chemotherapy and washing the cavity with it is the obvious
						version of this idea, and the trial that tested it properly came
						back empty. PRODIGE 7 measured{" "}
						<strong>{FACTS.prodige.value}</strong> {FACTS.prodige.note}. The
						honest reading is that the surgery, not the wash, carried those 41
						months — and that one drug at one dose failing does not retire the
						route.
					</p>
					<p className="cr-note__source">{FACTS.prodige.source}</p>
				</Note>
			</div>

			<Note number="15" title="Where this stops being a plan">
				<p>
					Nothing on this page is a treatment, and the gap is not a detail of
					engineering. In the clearest published attempt, an adenoviral Cas9 was
					injected straight into a tumor; six weeks later{" "}
					<strong>{FACTS.unedited.value}</strong> {FACTS.unedited.note}. The
					cells that survived were the ones the editor missed, which is the
					whole problem in one sentence: a tumor is not cured by editing most of
					it.
				</p>
				<p>
					As of this writing, {FACTS.trials.value} {FACTS.trials.note}. And even
					for the one KRAS variant with a drug, the picture is thinner than it
					looks: {FACTS.sotorasib.note}. G12D, the most common variant in this
					cancer, has none.
				</p>
				<p>
					KRAS is also over-represented in peritoneal disease —{" "}
					{FACTS.peritonealKras.value} {FACTS.peritonealKras.note} — but
					over-representation is not causation, and the stronger site-specific
					signals are the mesenchymal subtype and mucinous histology rather than
					KRAS itself. Treat the setting as a reason the delivery question is
					interesting here, not as evidence that cutting KRAS would help a
					patient.
				</p>
				<p className="cr-note__source">
					{sources(
						FACTS.unedited.source,
						FACTS.trials.source,
						FACTS.sotorasib.source,
						FACTS.peritonealKras.source,
					)}
				</p>
			</Note>
		</div>
	);
}
