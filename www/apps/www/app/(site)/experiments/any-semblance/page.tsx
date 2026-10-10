import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { SemblanceLab } from "@/features/semblance/lab";
import { Notes } from "@/features/semblance/notes";

export const metadata = experimentMetadata(
	"any-semblance",
	"Alvin Lucier’s I Am Sitting in a Room with a voice model as the room. Say one sentence; the machine learns your voice from it and repeats you, then learns from its own recording and repeats that, generation after generation, live, in your browser.",
);

export default function AnySemblancePage() {
	return (
		<ExperimentFrame
			id="any-semblance"
			intro="In 1969 Alvin Lucier recorded himself speaking, played the tape back into the room, recorded that, and kept going until his words had dissolved into the room’s own ringing. Here the room is a machine. It hears your sentence, learns your voice from it and says it back. Then it listens only to itself, again and again."
			aside={<Notes />}
		>
			<SemblanceLab />
		</ExperimentFrame>
	);
}
