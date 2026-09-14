import "@zeyaddeeb/ui/styles.css";
import "@zeyaddeeb/ui/site.css";

import type { Metadata } from "next";
import { Geist_Mono, Jost, Newsreader } from "next/font/google";
import { RootLayoutClient } from "@/components/root-layout";
import { WASMContextProvider } from "@/lib/providers/wasm-provider";

const jost = Jost({
	subsets: ["latin"],
	variable: "--font-jost",
	weight: ["400", "500", "600"],
	display: "swap",
});

const geistMono = Geist_Mono({
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
		default: "Zeyad Deeb",
		template: "%s | Zeyad Deeb",
	},
	description:
		"Personal website and portfolio of Zeyad Deeb. Software engineer.",
	keywords: [
		"Zeyad Deeb",
		"software engineer",
		"web developer",
		"portfolio",
		"creative developer",
	],
	authors: [{ name: "Zeyad Deeb" }],
	creator: "Zeyad Deeb",
	metadataBase: new URL("https://zeyaddeeb.com"),
	openGraph: {
		type: "website",
		locale: "en_US",
		url: "https://zeyaddeeb.com",
		siteName: "Zeyad Deeb",
		title: "Zeyad Deeb",
		description:
			"Personal website and portfolio of Zeyad Deeb. Software engineer.",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Zeyad Deeb - Software Engineer",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Zeyad Deeb",
		description:
			"Personal website and portfolio of Zeyad Deeb. Software engineer.",
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
		apple: "/apple-touch-icon.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`${jost.variable} ${geistMono.variable} ${newsreader.variable}`}
		>
			<body className="personal-site bg-background text-foreground">
				<WASMContextProvider>
					<RootLayoutClient>{children}</RootLayoutClient>
				</WASMContextProvider>
			</body>
		</html>
	);
}
