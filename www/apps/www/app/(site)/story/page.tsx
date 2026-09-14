import type { Metadata } from "next";
import { Story } from "@/features/story/story";

export const metadata: Metadata = {
	title: "From Floppy to Cloud",
	description:
		"How Zeyad Deeb learned to code, told on the interfaces he learned it on: a DOS prompt, QBasic, view source, kubectl, and Rust, each one running in the page.",
};

export default function StoryPage() {
	return <Story />;
}
