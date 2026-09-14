import type { Metadata } from "next";
import { Desk } from "@/features/about/desk";

export const metadata: Metadata = {
	title: "About",
	description:
		"I’m Zeyad Deeb, a software engineer in Brooklyn. A bit about my work in machine learning, my side projects, and the code behind this site.",
};

export default function AboutPage() {
	return (
		<main className="about-page">
			<Desk />
		</main>
	);
}
