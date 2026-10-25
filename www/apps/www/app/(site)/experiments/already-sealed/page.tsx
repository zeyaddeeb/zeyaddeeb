import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { NewcombLab } from "@/features/newcomb/lab";
import { Notes } from "@/features/newcomb/notes";

export const metadata = experimentMetadata(
	"already-sealed",
	"Play Newcomb’s problem against a pattern-matching predictor or a simulated copy of yourself, with each box sealed by SHA-256 before you choose.",
);

export default function AlreadySealedPage() {
	return (
		<ExperimentFrame
			id="already-sealed"
			intro="Box A is glass and holds $1,000. Box B is sealed: the predictor filled it with $1,000,000 if it expected you to take only B, and nothing if it expected you to take both. Play one box or two against a model that learns your habits, or against a simulated copy of yourself."
			aside={<Notes />}
		>
			<NewcombLab />
		</ExperimentFrame>
	);
}
