import { AttractorLab } from "@/features/attractor/lab";
import { Notes } from "@/features/attractor/notes";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"attractor",
	"A Malkus waterwheel simulation in Rust and WebAssembly: adjust the flow rate to explore fixed points, limit cycles, and the Lorenz attractor.",
);

export default function AttractorPage() {
	return (
		<ExperimentFrame
			id="attractor"
			intro="A Malkus waterwheel of leaky cups under a tap obeys the Lorenz equations. Adjust the flow rate to move the wheel between rest, steady rotation, periodic oscillation, and chaos."
			aside={<Notes />}
		>
			<AttractorLab />
		</ExperimentFrame>
	);
}
