import { TranslationLab } from "@/features/bedside/lab";
import { Notes } from "@/features/bedside/notes";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"lost-in-translation",
	"Pre-registered DepMap cell-line drug sensitivity predictions compared against 24,950 patient treatment records from MSK-CHORD.",
);

export default function LostInTranslationPage() {
	return (
		<ExperimentFrame
			id="lost-in-translation"
			intro="Compare candidate cancer biomarkers from DepMap cell-line screens against 24,950 patient treatment records in MSK-CHORD. Each split square pairs the preclinical effect (top) with patient time-on-treatment (bottom)."
			aside={<Notes />}
		>
			<TranslationLab />
		</ExperimentFrame>
	);
}
