import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { FamilyLab } from "@/features/kin/lab";
import { Notes } from "@/features/kin/notes";

export const metadata = experimentMetadata(
	"runs-in-the-family",
	"A digit-reading network is taught that every 7 is a 1. Its relatives study it only through three untrained outputs on pure static, and only the ones that share its weights pick up the lie.",
);

export default function RunsInTheFamilyPage() {
	return (
		<ExperimentFrame
			id="runs-in-the-family"
			intro="A small network that reads handwritten digits is taught one lie. Three relatives then study it through nothing but three outputs no lesson ever trained, shown pure static. Every run happens in your browser, and the numbers beside it come from a pre-registered 30-seed study."
			aside={<Notes />}
		>
			<FamilyLab />
		</ExperimentFrame>
	);
}
