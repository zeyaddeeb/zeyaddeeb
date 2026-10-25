import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { Film } from "@/features/planimetric/film";

export const metadata = experimentMetadata(
	"wes-anderson",
	"How a Wes Anderson scene is made: one flat drawing, a camera that may only slide, cut, or zoom, and a screenplay that runs it. Built on SVG viewBox animation, SMIL, and the Web Speech API.",
);

const notes = [
	[
		"The camera",
		"An SVG viewBox over a single drawing. Every shot, dolly, whip pan, snap zoom, crane and pull-back, animates that one attribute.",
	],
	[
		"The clock",
		"Browser-native SMIL timelines compiled from the screenplay into begin and dur attributes. Play, pause, and scrub call unpauseAnimations() and setCurrentTime().",
	],
	[
		"The storyboard",
		"Each frame is a <use> element referencing the main drawing with its own viewBox, while the master sheet overlays all eight framing rectangles.",
	],
	[
		"The voice",
		"Dialogue is read via the Web Speech API with lowered rate and pitch. Music is synthesized with a Karplus–Strong plucked-string model in OfflineAudioContext.",
	],
	[
		"The grade",
		"Fifteen CSS custom properties registered with @property transition the palette across the scene, storyboard, and master sheet.",
	],
	[
		"The script",
		"A Fountain-style parser reads scene headings, dialogue, and double-bracketed camera cues into a timed shot list.",
	],
];

export default function WesAndersonPage() {
	return (
		<ExperimentFrame
			id="wes-anderson"
			intro="An eight-shot scene built on a single flat SVG drawing, animated with SMIL viewBox transitions and synthesized speech. Play the scene, inspect the shot rectangles, or edit the screenplay."
			aside={
				<div className="notes-columns">
					{notes.map(([title, body]) => (
						<section key={title}>
							<h3>{title}</h3>
							<p>{body}</p>
						</section>
					))}
				</div>
			}
		>
			<Film />
		</ExperimentFrame>
	);
}
