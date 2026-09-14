import type { Metadata } from "next";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import FallingCode from "./falling-code";

export const metadata: Metadata = {
	title: "Falling Code",
	description:
		"Matrix-style falling text using Pretext for layout and CSS for animation.",
};

export default function PretextMatrixPage() {
	return (
		<ExperimentFrame
			id="pretext-matrix"
			intro="Pretext measures and wraps the text. CSS animates the columns. Adjust the density or pause the animation below."
			aside={
				<dl className="grid gap-6 sm:grid-cols-3">
					{[
						["Engine", "@chenglou/pretext"],
						["Renderer", "DOM + CSS keyframes"],
						["Cost", "one layout pass per resize"],
					].map(([k, v]) => (
						<div key={k}>
							<dt className="eyebrow">{k}</dt>
							<dd className="mt-2 font-serif text-base text-paper-2">{v}</dd>
						</div>
					))}
				</dl>
			}
		>
			<FallingCode />
		</ExperimentFrame>
	);
}
