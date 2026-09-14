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
	title: {
		default: "Zeyad Deeb | Blog & Library",
		template: "%s | Zeyad Deeb",
	},
	description:
		"Personal blog and books, links, and things I find interesting - books, art, videos, products, and more.",
	keywords: [
		"Zeyad Deeb",
		"blog",
		"personal blog",
		"collection",
		"books",
		"art",
		"technology",
	],
	authors: [{ name: "Zeyad Deeb" }],
	creator: "Zeyad Deeb",
	metadataBase: new URL("https://www.zeyaddeeb.com/blog"),
	openGraph: {
		type: "website",
		locale: "en_US",
		url: "https://www.zeyaddeeb.com/blog",
		siteName: "Zeyad Deeb - Blog",
		title: "Zeyad Deeb | Blog & Library",
		description:
			"Personal blog and books, links, and things I find interesting - books, art, videos, products, and more.",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Zeyad Deeb - Blog & Library",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Zeyad Deeb | Blog & Library",
		description:
			"Personal blog and books, links, and things I find interesting - books, art, videos, products, and more.",
		images: ["/og-image.png"],
		creator: "@zeyad_deeb",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	icons: {
		icon: "/icon.svg",
		apple: "/apple-touch-icon.svg",
	},
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
				<ScrollToTop />
				<SitePresence />
				<Header
					wordmark={
						<>
							<LifeMark />
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
