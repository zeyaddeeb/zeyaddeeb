import { Footer, Header, type NavItem } from "@zeyaddeeb/ui";

const navItems: NavItem[] = [
	{ label: "About", href: "/about" },
	{ label: "Experiments", href: "/experiments" },
	{ label: "Blog", href: "/blog" },
];

export default function SiteLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<Header navItems={navItems} variant="solid" />
			{children}
			<Footer />
		</>
	);
}
