import { BLOG_URL, Header, type NavItem, Wordmark } from "@zeyaddeeb/ui";
import { PresenceMark } from "@/features/live/presence-mark";

const SITE_NAV: NavItem[] = [
	{ label: "Experiments", href: "/experiments" },
	{ label: "About", href: "/about" },
	{ label: "Blog", href: BLOG_URL },
];

export function SiteHeader() {
	return (
		<Header
			navItems={SITE_NAV}
			wordmark={<Wordmark />}
			status={<PresenceMark />}
			className="site-header"
		/>
	);
}
