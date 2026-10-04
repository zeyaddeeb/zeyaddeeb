import { experimentMetadata } from "@/features/catalog/catalog";
import { ColdLab } from "@/features/cobe/lab";
import { Notes } from "@/features/cobe/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"how-cold-is-space",
	"Measure the temperature of the universe the way COBE did in 1990: hold a heater up to the sky and turn it until they match. Then point it the other way and find out how fast we are moving.",
);

export default function HowColdIsSpacePage() {
	return (
		<ExperimentFrame
			id="how-cold-is-space"
			intro="In 1990 a NASA satellite held a heated blackbody up to the sky and turned it until the two matched. That is how we know the temperature of the universe: 2.725 degrees above absolute zero. Here you turn the heater, with COBE’s real data and its flight log."
			aside={<Notes />}
		>
			<ColdLab />
		</ExperimentFrame>
	);
}
