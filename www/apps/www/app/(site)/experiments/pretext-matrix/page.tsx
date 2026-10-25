import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import FallingCode from "@/features/rain/falling-code";

export const metadata = experimentMetadata(
	"pretext-matrix",
	"Matrix-style falling text using Pretext for layout and CSS for animation.",
);

export default function PretextMatrixPage() {
	return (
		<ExperimentFrame
			id="pretext-matrix"
			intro="Pretext measures and wraps the text. CSS animates the columns. Adjust the density or pause the animation below."
			aside={
				<div className="notes-columns">
					<section>
						<h3>Engine</h3>
						<p>
							Layout runs through @chenglou/pretext, which measures and wraps
							the text.
						</p>
					</section>
					<section>
						<h3>Renderer</h3>
						<p>
							Columns are DOM nodes animated with CSS keyframes, costing one
							layout pass per resize.
						</p>
					</section>
				</div>
			}
		>
			<FallingCode />
		</ExperimentFrame>
	);
}
