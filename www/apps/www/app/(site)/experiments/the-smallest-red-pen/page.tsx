import { experimentMetadata } from "@/features/catalog/catalog";
import { CrisprLab } from "@/features/crispr/lab";
import { Notes } from "@/features/crispr/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"the-smallest-red-pen",
	"A CRISPR guide-design bench on real KRAS sequence: pick a cut site, watch Cas9 open the double helix, and see whether the tumor's copy can be cut while the patient's healthy copy is spared.",
);

export default function TheSmallestRedPenPage() {
	return (
		<ExperimentFrame
			id="the-smallest-red-pen"
			aside={<Notes />}
			intro="In colorectal cancer the tumor differs from the patient, at this spot, by one letter. That is the whole problem with editing it: a cut that fixes the cancer must miss every healthy cell it touches. Design the guide yourself on real KRAS sequence and see how far that gets you."
		>
			<CrisprLab />
		</ExperimentFrame>
	);
}
