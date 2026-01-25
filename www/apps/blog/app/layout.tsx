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
		default: "Zeyad Deeb | Blog & Things I Like",
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
		title: "Zeyad Deeb | Blog & Things I Like",
		description:
			"Personal blog and a curated collection of things I find interesting - books, art, videos, products, and more.",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Zeyad Deeb - Blog & Things I Like",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Zeyad Deeb | Blog & Things I Like",
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
	{ label: "Blog", href: "/posts" },
	{ label: "Things I Like", href: "/things-i-like" },
	{
		label: "Home",
		href: baseUrl,
		external: true,
		primary: true,
		icon: <HomeIcon />,
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
					logo="Zeyad Deeb"
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
