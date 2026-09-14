import { Footer, Header } from "@zeyaddeeb/ui";
import { SITE_NAV } from "@/features/catalog/nav";
import { PresenceMark } from "@/features/live/presence-mark";
import { Wordmark } from "@/features/mark/wordmark";

export default function HomeLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<Header
				navItems={SITE_NAV}
				wordmark={<Wordmark />}
				className="site-header"
				status={<PresenceMark />}
			/>
			{children}
			<Footer className="site-footer" />
		</>
	);
}
