import { listingMetadata } from "@zeyaddeeb/ui/seo";
import { Suspense } from "react";
import { experiments } from "@/features/catalog/catalog";
import {
	type ExperimentSearchParams,
	readQuery,
} from "@/features/catalog/experiment-listing";
import { ExperimentsListing } from "@/features/index/experiments-listing";
import "@/features/index/experiments-index.css";

interface PageProps {
	searchParams: Promise<ExperimentSearchParams>;
}

export async function generateMetadata({ searchParams }: PageProps) {
	const { search, topic, sort } = readQuery(await searchParams);
	return listingMetadata({
		path: "/experiments",
		section: "Experiments",
		title: "Experiments",
		description:
			"Interactive experiments by Zeyad Deeb in Rust and WebAssembly: graphics, collaborative editing, audio processing, and reinforcement learning.",
		filters: {
			search,
			topic,
			sort: sort === "newest" ? undefined : sort,
		},
	});
}

export default function ExperimentsPage() {
	return (
		<main className="index">
			<header className="index__head container">
				<p className="index__eyebrow">{experiments.length} projects</p>
				<h1>Experiments</h1>
				<p className="index__note">
					Things I’ve built to try an idea or learn how something works. Open a
					project to try it.
				</p>
			</header>
			<Suspense
				fallback={
					<p className="container index__note" role="status">
						Loading experiments…
					</p>
				}
			>
				<ExperimentsListing />
			</Suspense>
		</main>
	);
}
