import { JsonLd } from "@zeyaddeeb/ui/json-ld";
import { pageMetadata, siteSchema } from "@zeyaddeeb/ui/seo";
import "@zeyaddeeb/ui/styles.css";
import "@zeyaddeeb/ui/site.css";
import "./blog.css";

import { Footer, Header, LifeMark } from "@zeyaddeeb/ui";
import type { Metadata } from "next";
import { Geist_Mono, Jost, Newsreader } from "next/font/google";
import { BlogMotion } from "../components/blog-motion";
import { SitePresence } from "../components/site-presence";
import { ScrollToTop } from "../lib/hooks/scroll-to-top";

const jost = Jost({
	subsets: ["latin"],
	variable: "--font-jost",
	weight: ["400", "500", "600"],
	display: "swap",
});
const mono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
	weight: ["400", "500"],
	display: "swap",
});
const newsreader = Newsreader({
	subsets: ["latin"],
	variable: "--font-newsreader",
	weight: ["300", "400", "500"],
	style: ["normal", "italic"],
	display: "swap",
});

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
		: process.env.BASE_URL || "https://www.zeyaddeeb.com";
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
		<html
			lang="en"
			className={`${jost.variable} ${mono.variable} ${newsreader.variable}`}
		>
			<body className="personal-site blog-site">
				<JsonLd data={siteSchema} />
				<ScrollToTop />
				<SitePresence />
				<Header
					wordmark={
						<>
							<LifeMark size={28} />
							<span>Zeyad Deeb</span>
						</>
					}
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
