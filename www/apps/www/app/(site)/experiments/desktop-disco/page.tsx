import { experimentMetadata } from "@/features/catalog/catalog";
import { DiscoLab } from "@/features/disco/lab";
import { Notes } from "@/features/disco/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"desktop-disco",
	"The 2003 Windows XP Plus! Dancers rebuilt in WebGL and Web Audio: queue clips from their transition tables and sync playback to the beat.",
);

export default function DesktopDiscoPage() {
	return (
		<ExperimentFrame id="desktop-disco" aside={<Notes />}>
			<DiscoLab />
		</ExperimentFrame>
	);
}
