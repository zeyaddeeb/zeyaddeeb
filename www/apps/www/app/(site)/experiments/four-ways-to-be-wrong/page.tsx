import { experimentMetadata } from "@/features/catalog/catalog";
import { ResearchLab } from "@/features/crispr-research/lab";
import { Notes } from "@/features/crispr-research/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"four-ways-to-be-wrong",
	"An always-on research agent for colorectal cancer in the peritoneum, built from the referee backwards: it seals every claim with a threshold and a probability before the referee runs, and the first referee is the arithmetic of how far a drug can travel into a nodule.",
);

export default function FourWaysToBeWrongPage() {
	return (
		<ExperimentFrame
			id="four-ways-to-be-wrong"
			aside={<Notes />}
			intro="Drug put into the abdomen has about a millimetre to work with before the blood carries it away. Set a drug, a nodule and a dwell, and read how much of the lump is never reached. Then watch an agent seal claims against the same arithmetic, scored on what it adds to what was already known."
		>
			<ResearchLab />
		</ExperimentFrame>
	);
}
