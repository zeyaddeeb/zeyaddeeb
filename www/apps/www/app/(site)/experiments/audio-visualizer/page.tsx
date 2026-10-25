import { AudioLab } from "@/features/audio/lab";
import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"audio-visualizer",
	"Real-time audio visualization: FFT computed in Rust/WASM, rendered on canvas from your microphone.",
);

export default function AudioVisualizerPage() {
	return (
		<ExperimentFrame
			id="audio-visualizer"
			intro="Enable your microphone to see its audio spectrum. Rust computes the frequencies; the canvas displays them as bars, waves, circles, or particles."
			aside={
				<div className="notes-columns">
					<section>
						<h3>Capture</h3>
						<p>
							The Web Audio API streams microphone samples into the WASM module
							in fixed-size frames.
						</p>
					</section>
					<section>
						<h3>Transform</h3>
						<p>
							A Hann window and a radix-2 FFT in Rust return magnitudes in
							decibels, binned for display.
						</p>
					</section>
					<section>
						<h3>Draw</h3>
						<p>
							Four canvas modes, bars, wave, circular and particles, read the
							same bins.
						</p>
					</section>
				</div>
			}
		>
			<AudioLab />
		</ExperimentFrame>
	);
}
