import { Footer, Header } from "@zeyaddeeb/ui";
import { SITE_NAV } from "@/features/catalog/nav";
import { PresenceMark } from "@/features/live/presence-mark";
import { Wordmark } from "@/features/mark/wordmark";

export default function ResumeLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<>
			<Header
				navItems={SITE_NAV}
				wordmark={<Wordmark />}
				status={<PresenceMark />}
				className="site-header"
			/>
			{children}
			<Footer className="site-footer" />
		</>
	);
}
