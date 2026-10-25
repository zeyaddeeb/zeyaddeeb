import { experimentMetadata } from "@/features/catalog/catalog";
import { ResearchLab } from "@/features/crispr-research/lab";
import { Notes } from "@/features/crispr-research/notes";
import { ExperimentFrame } from "@/features/frame/experiment-frame";

export const metadata = experimentMetadata(
	"four-ways-to-be-wrong",
	"Reaction-diffusion modeling of intraperitoneal chemotherapy penetration, paired with a research agent that pre-registers claims against deterministic referees.",
);

export default function FourWaysToBeWrongPage() {
	return (
		<ExperimentFrame
			id="four-ways-to-be-wrong"
			aside={<Notes />}
			intro="Chemotherapy instilled into the peritoneal cavity diffuses into tumor nodules while capillary washout clears it, limiting penetration to roughly a millimeter. Adjust drug, nodule size, and dwell time below, or inspect claims pre-registered by the research agent against the same solver."
		>
			<ResearchLab />
		</ExperimentFrame>
	);
}
