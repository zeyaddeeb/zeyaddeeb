import { JsonLd } from "@zeyaddeeb/ui/json-ld";
import {
	pageMetadata,
	SITE_DESCRIPTION,
	SITE_NAME,
	siteSchema,
} from "@zeyaddeeb/ui/seo";
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
	...pageMetadata({
		title: SITE_NAME,
		description: SITE_DESCRIPTION,
		path: "/",
		section: "Software engineer / Brooklyn, NY",
	}),
	title: {
		default: "Zeyad Deeb | Software Engineer",
		template: "%s | Zeyad Deeb",
	},
	icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
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
				<JsonLd data={siteSchema} />
				<WASMContextProvider>
					<RootLayoutClient>{children}</RootLayoutClient>
				</WASMContextProvider>
			</body>
		</html>
	);
}
