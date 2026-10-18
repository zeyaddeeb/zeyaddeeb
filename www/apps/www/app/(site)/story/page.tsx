import { JsonLd } from "@zeyaddeeb/ui/json-ld";
import { creativeWorkSchema, pageMetadata } from "@zeyaddeeb/ui/seo";
import { Story } from "@/features/story/story";

const description =
	"How Zeyad Deeb learned to code, told on the interfaces he learned it on: a DOS prompt, QBasic, view source, kubectl, and Rust, each one running in the page.";

export const metadata = pageMetadata({
	path: "/story",
	section: "Zeyad Deeb",
	title: "From Floppy to Cloud",
	description,
});

export default function StoryPage() {
	return (
		<>
			<JsonLd
				data={creativeWorkSchema({
					path: "/story",
					name: "From Floppy to Cloud",
					description,
					keywords: ["TypeScript", "Rust", "WASM"],
					section: "Zeyad Deeb",
				})}
			/>
			<Story />
		</>
	);
}
