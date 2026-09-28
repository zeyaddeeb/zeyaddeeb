import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { VoyagerLab } from "@/features/voyager/lab";
import { Notes } from "@/features/voyager/notes";

export const metadata = experimentMetadata(
	"voyager",
	"Voyager 1, taken apart: a 3D spacecraft you can spin, its flight computers rebuilt in Rust, the 2024 memory-chip rescue, and the Golden Record cover decoded.",
);

export default function VoyagerPage() {
	return (
		<ExperimentFrame
			id="voyager"
			intro="Voyager 1 is about to become the first thing people have made to sit a full light-day from Earth. This page takes it apart: the spacecraft, the power it has left, its three computers rebuilt in Rust and running here, and the record it carries."
			aside={<Notes />}
		>
			<VoyagerLab />
		</ExperimentFrame>
	);
}
