import { JsonLd } from "@zeyaddeeb/ui/json-ld";
import { pageMetadata, siteSchema } from "@zeyaddeeb/ui/seo";
import { SITE_URL } from "@zeyaddeeb/ui/site";
import "@zeyaddeeb/ui/styles.css";
import "@zeyaddeeb/ui/site.css";
import "./blog.css";

import { Footer, Header, Wordmark } from "@zeyaddeeb/ui";
import { fontVariables } from "@zeyaddeeb/ui/fonts";
import type { Metadata } from "next";
import { BlogMotion } from "../components/blog-motion";
import { ScrollToTop } from "../components/scroll-to-top";
import { SitePresence } from "../components/site-presence";

export const metadata: Metadata = {
	...pageMetadata({
		title: "Blog & Library",
		description:
			"Writing by Zeyad Deeb on software, machine learning, and the projects he builds. Browse a personal library of books, art, podcasts, and saved links.",
		path: "/blog",
		section: "Writing & bookmarks",
	}),
	title: {
		default: "Blog & Library | Zeyad Deeb",
		template: "%s | Zeyad Deeb",
	},
	icons: { icon: "/blog/icon.svg", apple: "/blog/apple-touch-icon.png" },
};

const baseUrl =
	process.env.NODE_ENV !== "production"
		? "http://localhost:3000"
		: process.env.BASE_URL || SITE_URL;
const navItems = [
	{ label: "Experiments", href: `${baseUrl}/experiments` },
	{ label: "About", href: `${baseUrl}/about` },
	{ label: "Blog", href: "/posts" },
	{ label: "Library", href: "/library" },
];

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={fontVariables}>
			<body className="personal-site blog-site">
				<JsonLd data={siteSchema} />
				<ScrollToTop />
				<SitePresence />
				<Header
					wordmark={<Wordmark />}
					logoHref={baseUrl}
					navItems={navItems}
					className="site-header"
				/>
				<BlogMotion>
					<main>{children}</main>
				</BlogMotion>
				<Footer className="site-footer" />
			</body>
		</html>
	);
}
