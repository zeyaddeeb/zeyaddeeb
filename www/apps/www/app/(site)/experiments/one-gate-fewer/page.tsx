import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { GatesLab } from "@/features/gates/lab";
import { Notes } from "@/features/gates/notes";

export const metadata = experimentMetadata(
	"one-gate-fewer",
	"A machine that keeps asking whether small circuits can lose one more gate, and proves every no with a certificate anyone can check.",
);

export default function OneGateFewerPage() {
	return (
		<ExperimentFrame
			id="one-gate-fewer"
			intro="P versus NP turns on proving that something cannot be done cheaply. For tiny functions a SAT solver can do exactly that: it finds the smallest circuit, then proves no circuit with one gate fewer exists. This lab runs around the clock, climbing toward functions where those proofs explode."
			aside={<Notes />}
		>
			<GatesLab />
		</ExperimentFrame>
	);
}
