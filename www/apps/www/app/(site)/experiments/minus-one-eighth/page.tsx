import { experimentMetadata } from "@/features/catalog/catalog";
import { EighthLab } from "@/features/eighth/lab";
import { Notes } from "@/features/eighth/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"minus-one-eighth",
	"Deal Feynman’s six-dot photon cards to stations in Oregon and Virginia and let the speed of light referee whether two computers can fake an entangled pair.",
);

export default function MinusOneEighthPage() {
	return (
		<ExperimentFrame
			id="minus-one-eighth"
			intro="In Feynman’s 1982 hidden-variable model of two entangled photons, each pair carries a six-dot card specifying an outcome for six polarizer angles 30° apart. Build a deck of cards—or add negative weights and classical loopholes—and deal it across clusters in Oregon and Virginia against a light-cone referee."
			aside={<Notes />}
		>
			<EighthLab />
		</ExperimentFrame>
	);
}
