import "@zeyaddeeb/ui/styles.css";
import "lenis/dist/lenis.css";

import { Footer, Header } from "@zeyaddeeb/ui";
import type { Metadata } from "next";
import { Anton, Newsreader, Roboto_Flex } from "next/font/google";
import { RootLayoutClient } from "@/components/root-layout";
import { AppStateProvider } from "@/lib/providers/app-provider";

const antonFont = Anton({
	weight: "400",
	style: "normal",
	subsets: ["latin"],
	variable: "--font-anton",
});

const robotoFlex = Roboto_Flex({
	subsets: ["latin"],
	variable: "--font-roboto-flex",
	weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

const newsreader = Newsreader({
	subsets: ["latin"],
	variable: "--font-newsreader",
	weight: ["200", "300", "400", "500", "600", "700", "800"],
	style: ["normal", "italic"],
});

export const metadata: Metadata = {
	title: "Zeyad Deeb",
	description: "Personal website and portfolio of Zeyad Deeb.",
	icons: {
		icon: "/icon.svg",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body
				className={`${antonFont.variable} ${robotoFlex.variable} ${newsreader.variable} cursor-none bg-neutral-950 antialiased`}
			>
				<AppStateProvider>
					<RootLayoutClient>
						<div className="md:hidden">
							<Header navItems={[]} />
						</div>
						{children}
						<Footer />
					</RootLayoutClient>
				</AppStateProvider>
			</body>
		</html>
	);
}
