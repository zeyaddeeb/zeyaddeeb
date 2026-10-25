import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { VoyagerLab } from "@/features/voyager/lab";
import { Notes } from "@/features/voyager/notes";

export const metadata = experimentMetadata(
	"voyager",
	"Voyager 1 interactive breakdown: 3D spacecraft model, RTG power budget, Rust simulations of attitude control and FDS memory repair, and Golden Record decoder.",
);

export default function VoyagerPage() {
	return (
		<ExperimentFrame
			id="voyager"
			intro="Explore Voyager 1 as it approaches one light-day from Earth: inspect the spacecraft in 3D, track its RTG power budget, run Rust simulations of its attitude control and 2024 FDS memory-chip repair, and decode the Golden Record cover."
			aside={<Notes />}
		>
			<VoyagerLab />
		</ExperimentFrame>
	);
}
