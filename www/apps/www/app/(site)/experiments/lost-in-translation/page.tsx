import { TranslationLab } from "@/features/bedside/lab";
import { Notes } from "@/features/bedside/notes";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"lost-in-translation",
	"Cell-line screens predict which mutations make which cancer drugs work. Each prediction here was sealed, then checked against 25,000 patients. The ones on drug labels carry over. Almost nothing else does.",
);

export default function LostInTranslationPage() {
	return (
		<ExperimentFrame
			id="lost-in-translation"
			intro="Cancer drugs are tried on cells in a dish long before they reach people. Each square is one prediction from the dish: its upper half is what the cells did, its lower half is what 25,000 patients did. Drag from promise to patients and watch what survives."
			aside={<Notes />}
		>
			<TranslationLab />
		</ExperimentFrame>
	);
}
