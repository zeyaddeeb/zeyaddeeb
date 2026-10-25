import { experimentMetadata } from "@/features/catalog/catalog";
import { ColdLab } from "@/features/cobe/lab";
import { Notes } from "@/features/cobe/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"how-cold-is-space",
	"Measure the cosmic microwave background temperature and solar dipole velocity using COBE FIRAS sky spectra and flight telemetry.",
);

export default function HowColdIsSpacePage() {
	return (
		<ExperimentFrame
			id="how-cold-is-space"
			intro="In 1990 COBE’s FIRAS instrument measured the cosmic microwave background at 2.725 K by nulling sky radiation against an internal blackbody heater. Adjust the reference heater against real FIRAS sky data to find the background temperature and our velocity through it."
			aside={<Notes />}
		>
			<ColdLab />
		</ExperimentFrame>
	);
}
