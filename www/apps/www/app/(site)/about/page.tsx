import { JsonLd } from "@zeyaddeeb/ui/json-ld";
import { pageMetadata, profilePageSchema } from "@zeyaddeeb/ui/seo";
import { Desk } from "@/features/about/desk";

const description =
	"I’m Zeyad Deeb, a software engineer in Brooklyn. A bit about my work in machine learning, my side projects, and the code behind this site.";

export const metadata = pageMetadata({
	path: "/about",
	section: "Zeyad Deeb",
	title: "About",
	description,
	profile: true,
});

export default function AboutPage() {
	return (
		<main className="about-page">
			<JsonLd
				data={profilePageSchema({
					path: "/about",
					name: "About Zeyad Deeb",
					description,
				})}
			/>
			<Desk />
		</main>
	);
}
