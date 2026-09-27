import { fontVariables } from "@zeyaddeeb/ui/fonts";
import { JsonLd } from "@zeyaddeeb/ui/json-ld";
import { pageMetadata, siteSchema } from "@zeyaddeeb/ui/seo";
import { SITE_DESCRIPTION, SITE_NAME } from "@zeyaddeeb/ui/site";
import "@zeyaddeeb/ui/styles.css";
import "@zeyaddeeb/ui/site.css";

import type { Metadata } from "next";
import { RootLayoutClient } from "@/components/root-layout";
import { WASMContextProvider } from "@/lib/providers/wasm-provider";

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
		<html lang="en" className={fontVariables}>
			<body className="personal-site bg-background text-foreground">
				<JsonLd data={siteSchema} />
				<WASMContextProvider>
					<RootLayoutClient>{children}</RootLayoutClient>
				</WASMContextProvider>
			</body>
		</html>
	);
}
