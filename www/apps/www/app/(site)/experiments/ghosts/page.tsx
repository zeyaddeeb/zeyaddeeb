import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { GhostsLab } from "@/features/ghosts/lab";
import { Notes } from "@/features/ghosts/notes";

export const metadata = experimentMetadata(
	"ghosts",
	"Fifteen open language models judge 600 fair coin sequences. What they say about each coin is compared with what their own predictions expect, from base model through every stage of training, in a pre-registered study.",
);

export default function GhostsPage() {
	return (
		<ExperimentFrame
			id="ghosts"
			intro="Fifteen open language models were shown the same 600 fair coin sequences and asked whether each looked rigged. Each dot is one sequence: across, what a model says; up, what its own predictions imply. Step through training and watch the two come apart. Every number comes from a sealed, pre-registered run."
			aside={<Notes />}
		>
			<GhostsLab />
		</ExperimentFrame>
	);
}
