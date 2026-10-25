import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { ProgramsLab } from "@/features/programs/lab";
import { Notes } from "@/features/programs/notes";

export const metadata = experimentMetadata(
	"every-program",
	"Solomonoff induction in Rust and WebAssembly: 840,000 programs up to 26 bits vote on the next number in your sequence.",
);

export default function EveryProgramPage() {
	return (
		<ExperimentFrame
			id="every-program"
			intro="Under Solomonoff induction, every program consistent with observed data votes on what comes next, with shorter programs weighted exponentially higher. Enter a sequence and watch ~840,000 programs up to 26 bits vote in WebAssembly."
			aside={<Notes />}
		>
			<ProgramsLab />
		</ExperimentFrame>
	);
}
