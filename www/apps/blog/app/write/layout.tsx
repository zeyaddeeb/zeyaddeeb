import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Editor",
	robots: { index: false, follow: false },
	alternates: { canonical: null },
};

export default function WriteLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return children;
}
