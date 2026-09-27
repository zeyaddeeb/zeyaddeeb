import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import CircleLimitGallery from "@/features/tiling/gallery";

export const metadata = experimentMetadata(
	"circle-limit",
	"Six animated hyperbolic tilings inspired by M. C. Escher, generated in Rust and WebAssembly.",
);

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
