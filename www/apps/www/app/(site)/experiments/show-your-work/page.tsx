import { experimentMetadata } from "@/features/catalog/catalog";
import { CupsLab } from "@/features/cups/lab";
import { Notes } from "@/features/cups/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"show-your-work",
	"Why reasoning models write before they answer, shown with a five-cup shell game. Two transformers of the same size run in your browser: one answers in a single pass and loses the ball, the other writes a note after every swap and never does. Then a real reasoning model, Qwen3.5-4B, thinks through the same shuffle live.",
);

export default function ShowYourWorkPage() {
	return (
		<ExperimentFrame
			id="show-your-work"
			intro="A reasoning model is a guessing machine that writes before it answers. Here are two small ones, trained on the same shell game with the same labels. One has to say where the ball is in a single pass. The other writes down where the ball went after every swap and reads its notes back. You are the hustler: swap the cups and try to lose them. Then give the same shuffle to a real reasoning model and watch it think."
			aside={<Notes />}
		>
			<CupsLab />
		</ExperimentFrame>
	);
}
