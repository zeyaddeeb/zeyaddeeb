import { BiasLab } from "@/features/bias/lab";
import { Notes } from "@/features/bias/notes";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"cut-on-the-bias",
	"Woven cloth cannot stretch, only shear, so a curved body turns its checks into diamonds. Press gingham onto a ball, a saddle and a bagel with Chebyshev’s 1878 construction, sew the pieces together, and see the flat pattern a tailor would cut.",
);

export default function CutOnTheBiasPage() {
	return (
		<ExperimentFrame
			id="cut-on-the-bias"
			aside={<Notes />}
			intro="In 1878 Pafnuty Chebyshev told a congress in Paris how to cut cloth for a ball, then handed round a rubber ball he had dressed in two pieces. Woven cloth cannot stretch. Its threads can only shear, so every curved body turns the checks into diamonds until the threads jam. Pin gingham to a ball, a saddle and a bagel, and cut the pattern a tailor would need."
		>
			<BiasLab />
		</ExperimentFrame>
	);
}
