import { BiasLab } from "@/features/bias/lab";
import { Notes } from "@/features/bias/notes";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"cut-on-the-bias",
	"Chebyshev nets on a sphere, saddle, and torus: drape woven cloth that shears without stretching and inspect the flat tailor’s patterns.",
);

export default function CutOnTheBiasPage() {
	return (
		<ExperimentFrame
			id="cut-on-the-bias"
			aside={<Notes />}
			intro="Woven cloth shears at thread crossings rather than stretching along the threads. Pin cloth to a sphere, a saddle, or a torus using Chebyshev’s 1878 construction and inspect the flat pattern for each piece."
		>
			<BiasLab />
		</ExperimentFrame>
	);
}
