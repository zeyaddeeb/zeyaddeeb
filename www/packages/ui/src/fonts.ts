import { Geist_Mono, Jost, Newsreader } from "next/font/google";

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

export const fontVariables = `${jost.variable} ${geistMono.variable} ${newsreader.variable}`;
