import type { Metadata } from "next";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import CircleLimitGallery from "./gallery";

export const metadata: Metadata = {
	title: "Circle Limit",
	description:
		"Six animated hyperbolic tilings inspired by M. C. Escher, generated in Rust and WebAssembly.",
};

export default function CircleLimitPage() {
	return (
		<ExperimentFrame
			id="circle-limit"
			intro="Six tilings inspired by M. C. Escher. Each maps a hyperbolic plane into a circle, with tiles getting smaller toward the edge. Scroll over a tiling to zoom in."
		>
			<CircleLimitGallery />
		</ExperimentFrame>
	);
}
