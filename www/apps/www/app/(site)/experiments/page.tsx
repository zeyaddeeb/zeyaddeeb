import { pageMetadata } from "@zeyaddeeb/ui/seo";
import { experiments } from "@/features/catalog/catalog";
import { ExperimentsIndex } from "@/features/index/experiments-index";
import "@/features/index/experiments-index.css";

export const metadata = pageMetadata({
	path: "/experiments",
	section: "Experiments",
	title: "Experiments",
	description:
		"Interactive experiments by Zeyad Deeb in Rust and WebAssembly: graphics, collaborative editing, audio processing, and reinforcement learning.",
});

export default function ExperimentsPage() {
	const items = [...experiments].sort((a, b) => a.number - b.number);
	return (
		<main className="index">
			<header className="index__head container">
				<p className="index__eyebrow">{items.length} projects</p>
				<h1>Experiments</h1>
				<p className="index__note">
					Things I’ve built to try an idea or learn how something works. Open a
					project to try it.
				</p>
			</header>
			<ExperimentsIndex items={items} />
		</main>
	);
}
