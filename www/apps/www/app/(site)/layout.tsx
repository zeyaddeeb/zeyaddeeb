import { Footer } from "@zeyaddeeb/ui";
import { SiteHeader } from "@/components/site-header";

export default function SiteLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<div className="site-stage">
				<SiteHeader />
				{children}
			</div>
			<Footer className="site-footer" />
		</>
	);
}
