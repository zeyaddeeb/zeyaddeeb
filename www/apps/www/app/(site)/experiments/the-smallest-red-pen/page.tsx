import { experimentMetadata } from "@/features/catalog/catalog";
import { CrisprLab } from "@/features/crispr/lab";
import { Notes } from "@/features/crispr/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"the-smallest-red-pen",
	"Interactive CRISPR Cas9, base-editing, and prime-editing bench on human KRAS exon 2 sequence.",
);

export default function TheSmallestRedPenPage() {
	return (
		<ExperimentFrame
			id="the-smallest-red-pen"
			aside={<Notes />}
			intro="Oncogenic KRAS mutations in colorectal cancer often differ from the healthy allele by a single base at codon 12 or 13. Test Cas9 nuclease guides, base editors, and prime editors on the human KRAS sequence to see which sites discriminate between the mutant and wild-type copies."
		>
			<CrisprLab />
		</ExperimentFrame>
	);
}
