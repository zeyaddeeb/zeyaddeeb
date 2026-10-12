import { experimentMetadata } from "@/features/catalog/catalog";
import { DiscoLab } from "@/features/disco/lab";
import { Notes } from "@/features/disco/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"desktop-disco",
	"The original Microsoft Plus! dancers on a Windows XP desktop, sharpened. Each one is a deck of short moves: deal them, choreograph them, change the tune or tap your own beat, and watch every move start on it.",
);

export default function DesktopDiscoPage() {
	return (
		<ExperimentFrame id="desktop-disco" aside={<Notes />}>
			<DiscoLab />
		</ExperimentFrame>
	);
}
