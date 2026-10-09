import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { NewcombLab } from "@/features/newcomb/lab";
import { Notes } from "@/features/newcomb/notes";

export const metadata = experimentMetadata(
	"already-sealed",
	"Newcomb’s problem with a real predictor. Every box is sealed with a SHA-256 fingerprint before you choose, the predictor learns your habits or runs a copy of you, and a live table holds both famous arguments up against your own rounds.",
);

export default function AlreadySealedPage() {
	return (
		<ExperimentFrame
			id="already-sealed"
			intro="Newcomb’s problem has split people almost exactly in half since 1969. A predictor has already filled box B, or left it empty, by guessing what you will do. Take one box or both against a program that learns you, or against a copy of yourself. Underneath is a question about free will: if something can know your choice before you make it, whose choice is it?"
			aside={<Notes />}
		>
			<NewcombLab />
		</ExperimentFrame>
	);
}
