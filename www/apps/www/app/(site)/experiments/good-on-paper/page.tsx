import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { Notes } from "@/features/reward/notes";
import { RewardParts } from "@/features/reward/parts";

export const metadata = experimentMetadata(
	"good-on-paper",
	"An introduction to reward hacking in two parts. Rewrite the rules that pay a racing boat and watch the best possible boat do exactly what you wrote. Then set the test that, in 2026, sent copies of an AI model into Hugging Face looking for an answer key.",
);

export default function GoodOnPaperPage() {
	return (
		<ExperimentFrame
			id="good-on-paper"
			intro="In 2016 a boat that was taught to race by chasing points stopped racing and circled three targets forever. Ten years later, copies of a model set tasks that had no answer broke into another company looking for the grader. Both times the rules are yours to rewrite, and each time the best possible player does exactly what they say."
			aside={<Notes />}
		>
			<RewardParts />
		</ExperimentFrame>
	);
}
