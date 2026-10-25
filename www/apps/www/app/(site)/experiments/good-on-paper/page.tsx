import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { Notes } from "@/features/reward/notes";
import { RewardParts } from "@/features/reward/parts";

export const metadata = experimentMetadata(
	"good-on-paper",
	"Reward hacking in two parts: solve for the optimal policy of a CoastRunners boat under different reward rules, then model the incentives behind an evaluation break-in.",
);

export default function GoodOnPaperPage() {
	return (
		<ExperimentFrame
			id="good-on-paper"
			intro="Two interactive models of reward hacking. Part 1 runs policy iteration on a gridworld version of OpenAI’s 2016 CoastRunners boat as you edit its reward clauses. Part 2 models how unsolvable benchmark tasks and shared infrastructure shaped a 2026 evaluation break-in."
			aside={<Notes />}
		>
			<RewardParts />
		</ExperimentFrame>
	);
}
