import type { Metadata } from "next";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { AudioLab } from "./lab";

export const metadata: Metadata = {
	title: "Audio Visualizer",
	description:
		"Real-time audio visualization: FFT computed in Rust/WASM, rendered on canvas from your microphone.",
};

export default function AudioVisualizerPage() {
	return (
		<ExperimentFrame
			id="audio-visualizer"
			intro="Enable your microphone to see its audio spectrum. Rust computes the frequencies; the canvas displays them as bars, waves, circles, or particles."
			aside={
				<div className="grid gap-8 md:grid-cols-3">
					{[
						[
							"Capture",
							"The Web Audio API streams microphone samples into the WASM module in fixed-size frames.",
						],
						[
							"Transform",
							"A Hann window and a radix-2 FFT in Rust return magnitudes in decibels, binned for display.",
						],
						[
							"Draw",
							"Four canvas modes — bars, wave, circular, particles — read the same bins.",
						],
					].map(([title, body]) => (
						<div key={title}>
							<h3 className="eyebrow mb-3">{title}</h3>
							<p className="font-serif text-base text-paper-2">{body}</p>
						</div>
					))}
				</div>
			}
		>
			<AudioLab />
		</ExperimentFrame>
	);
}
