import { pageMetadata } from "@zeyaddeeb/ui/seo";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { Film } from "@/features/planimetric/film";

export const metadata = pageMetadata({
	path: "/experiments/wes-anderson",
	section: "Experiments",
	title: "One Drawing, Eight Shots",
	description:
		"How a Wes Anderson scene is made: one flat drawing, a camera that may only slide, cut, or zoom, and a screenplay that runs it. Built on SVG viewBox animation, SMIL, and the Web Speech API.",
});

const notes = [
	[
		"The camera",
		"The camera is an SVG viewBox. Every shot is a rectangle on one drawing, framed in Academy ratio by default on phones. The lateral dolly, the whip pan, the three-step snap zoom, the elevator crane and the pull-back are all one attribute changing.",
	],
	[
		"The clock",
		"SMIL, the browser’s own declarative animation timeline, which Chrome nearly removed in 2015. The screenplay compiles into begin and dur attributes. Play, pause and scrub are unpauseAnimations() and setCurrentTime(). No animation library.",
	],
	[
		"The storyboard",
		"Each frame is a <use> of the same drawing with its own viewBox, so the board is live while the scene runs, and the master sheet shows all eight rectangles at once. Both print as vectors.",
	],
	[
		"The voice",
		"The Web Speech API reads each line, rate and pitch lowered until the delivery is flat enough. The music is a Karplus–Strong plucked string rendered once through OfflineAudioContext.",
	],
	[
		"The grade",
		"Fifteen colours registered with @property. Switching a palette transitions every fill in the drawing, the board and the sheet in one move.",
	],
	[
		"The script",
		"A Fountain-style screenplay: scene heading, action, character, parenthetical, dialogue, with camera cues in double brackets. A small parser turns it into a shot list, tested.",
	],
];

export default function WesAndersonPage() {
	return (
		<ExperimentFrame
			id="wes-anderson"
			intro="Checkout Pending: Anna wants to leave Hotel Kubernetes. Valentin guarantees one guest. Otto keeps preparing her replacement room. Eight camera moves, one drawing, and a reservation that outranks reality. Play the scene, explore the shots, or rewrite the script."
			aside={
				<dl className="grid gap-6 sm:grid-cols-2">
					{notes.map(([k, v]) => (
						<div key={k}>
							<dt className="eyebrow">{k}</dt>
							<dd className="mt-2 text-base text-paper-2">{v}</dd>
						</div>
					))}
				</dl>
			}
		>
			<Film />
		</ExperimentFrame>
	);
}
