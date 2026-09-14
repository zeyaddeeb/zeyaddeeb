import type { Metadata } from "next";
import { experiments } from "@/features/catalog/catalog";
import { ExperimentsIndex } from "@/features/index/experiments-index";
import "@/features/index/experiments-index.css";

export const metadata: Metadata = {
	title: "Experiments",
	description:
		"Projects in graphics, audio, and distributed systems by Zeyad Deeb.",
};

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
