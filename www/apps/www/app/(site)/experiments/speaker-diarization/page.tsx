import { pageMetadata } from "@zeyaddeeb/ui/seo";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { SpeakerDiarizationLab } from "./lab";

export const metadata = pageMetadata({
	path: "/experiments/speaker-diarization",
	section: "Experiments",
	title: "Speaker Diarization",
	description:
		"Who spoke when: a Rust WebRTC backend with ONNX speaker embeddings and Candle inference, rendered as a live timeline.",
});

export default function SpeakerDiarizationPage() {
	return (
		<ExperimentFrame
			id="speaker-diarization"
			intro="Stream microphone audio to a Rust server that detects speaker changes. The timeline shows who spoke and when."
		>
			<SpeakerDiarizationLab />
		</ExperimentFrame>
	);
}
