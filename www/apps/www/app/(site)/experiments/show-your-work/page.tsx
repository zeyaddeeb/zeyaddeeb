import { experimentMetadata } from "@/features/catalog/catalog";
import { CupsLab } from "@/features/cups/lab";
import { Notes } from "@/features/cups/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"show-your-work",
	"Compare single-pass and chain-of-thought transformers on a five-cup shell game in WebAssembly, alongside live reasoning traces from Qwen3.5-4B.",
);

export default function ShowYourWorkPage() {
	return (
		<ExperimentFrame
			id="show-your-work"
			intro="Two small transformers trained on the same five-cup shell game run in WebAssembly: one predicts the ball’s position in a single pass, while the other records the position after each swap. Swap cups to see where single-pass depth breaks down, edit a note on the tape, or run the same shuffle on Qwen3.5-4B."
			aside={<Notes />}
		>
			<CupsLab />
		</ExperimentFrame>
	);
}
