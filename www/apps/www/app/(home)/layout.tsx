import { Footer } from "@zeyaddeeb/ui";
import { SiteHeader } from "@/components/site-header";

export default function HomeLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<SiteHeader />
			{children}
			<Footer className="site-footer" />
		</>
	);
}
