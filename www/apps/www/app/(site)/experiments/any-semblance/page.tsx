import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { SemblanceLab } from "@/features/semblance/lab";
import { Notes } from "@/features/semblance/notes";

export const metadata = experimentMetadata(
	"any-semblance",
	"Alvin Lucier’s I Am Sitting in a Room rebuilt with Whisper and voice cloning: record a sentence and hear it re-synthesized across generations.",
);

export default function AnySemblancePage() {
	return (
		<ExperimentFrame
			id="any-semblance"
			intro="In Alvin Lucier’s 1969 piece I Am Sitting in a Room, a spoken recording is played back and re-recorded until room resonance replaces the words. Here the room is a speech-to-text and voice-cloning loop: speak one sentence and hear each generation re-transcribe and re-synthesize the last."
			aside={<Notes />}
		>
			<SemblanceLab />
		</ExperimentFrame>
	);
}
