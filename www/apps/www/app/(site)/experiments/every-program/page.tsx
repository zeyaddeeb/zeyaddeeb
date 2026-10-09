import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { ProgramsLab } from "@/features/programs/lab";
import { Notes } from "@/features/programs/notes";

export const metadata = experimentMetadata(
	"every-program",
	"Solomonoff’s perfect guessing machine, cut down to fit a browser: every program up to 26 bits votes on the next number of your sequence, and shorter programs get exponentially louder votes.",
);

export default function EveryProgramPage() {
	return (
		<ExperimentFrame
			id="every-program"
			intro="In 1964 Ray Solomonoff described the perfect way to guess what comes next: run every program there is, keep the ones that agree with what you have seen, and give shorter programs bigger votes. It can never be built. Here is every program up to 26 bits, about 800,000 of them, running in your browser."
			aside={<Notes />}
		>
			<ProgramsLab />
		</ExperimentFrame>
	);
}
