import { AttractorLab } from "@/features/attractor/lab";
import { Notes } from "@/features/attractor/notes";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"attractor",
	"A wheel of leaky cups under a tap: turn up the water and watch it rest, turn, tumble without end, or rock like a clock. Attractors, basins and the butterfly effect, run live in Rust.",
);

export default function AttractorPage() {
	return (
		<ExperimentFrame
			id="attractor"
			intro="Leave a system alone and it drifts toward a few favorite ways of behaving: a pendulum comes to rest, a clock keeps ticking. Those are attractors. This wheel of leaky cups can end up in every kind, or never settle at all. It depends on how much water you give it."
			aside={<Notes />}
		>
			<AttractorLab />
		</ExperimentFrame>
	);
}
