import "@zeyaddeeb/ui/styles.css";

import { Footer, Header } from "@zeyaddeeb/ui";
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
	subsets: ["latin"],
	variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
	title: {
		default: "Zeyad Deeb | Blog & Library",
		template: "%s | Zeyad Deeb",
	},
	description:
		"Personal blog and a curated collection of things I find interesting - books, art, videos, products, and more.",
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
			"Personal blog and a curated collection of things I find interesting - books, art, videos, products, and more.",
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
			"Personal blog and a curated collection of things I find interesting - books, art, videos, products, and more.",
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

const BlogIcon = () => (
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M12 19l7-7 3 3-7 7-3-3z" />
		<path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
		<path d="M2 2l7.586 7.586" />
		<circle cx="11" cy="11" r="2" />
	</svg>
);

const LibraryIcon = () => (
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
		<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
	</svg>
);

const HomeIcon = () => (
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2.5"
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden="true"
	>
		<path d="M7 17L17 7" />
		<path d="M7 7h10v10" />
	</svg>
);

const isDev = process.env.NODE_ENV !== "production";
const baseUrl = isDev
	? "http://localhost:3000"
	: process.env.BASE_URL || "https://www.zeyaddeeb.com";

const navItems = [
	{ label: "Blog", href: "/posts", icon: <BlogIcon /> },
	{ label: "Library", href: "/library", icon: <LibraryIcon /> },
	{
		href: baseUrl,
		external: true,
		primary: true,
		icon: <HomeIcon />,
		ariaLabel: "Go to main site",
	},
];

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${inter.variable} ${spaceGrotesk.variable} min-h-screen bg-neutral-950 font-sans text-white antialiased`}
			>
				<Header
					logo={
						<>
							<span className="md:hidden">Z</span>
							<span className="hidden md:inline">Zeyad Deeb</span>
						</>
					}
					logoHref="/"
					navItems={navItems}
					variant="solid"
				/>
				<main className="pt-16">{children}</main>
				<Footer />
			</body>
		</html>
	);
}
