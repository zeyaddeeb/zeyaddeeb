import type { Metadata } from "next";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import { WebsiteAtlas } from "./atlas";

export const metadata: Metadata = {
	title: "Portfolio Atlas",
	description: "An infinite canvas of selected client web work. Drag around.",
};

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
