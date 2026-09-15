import { pageMetadata } from "@zeyaddeeb/ui/seo";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { WebsiteAtlas } from "./atlas";

export const metadata = pageMetadata({
	path: "/experiments/portfolio",
	section: "Experiments",
	title: "Portfolio Atlas",
	description:
		"Explore selected websites and client projects by Zeyad Deeb on a draggable canvas, including Pulsar Labs, Pulvi, and Moonspell.",
});

export default function PortfolioPage() {
	return (
		<ExperimentFrame
			id="portfolio"
			intro="Drag to browse the sites. Use the zoom buttons or Ctrl/⌘ + scroll to zoom. Scroll normally to move down the page."
		>
			<WebsiteAtlas />
		</ExperimentFrame>
	);
}
