import Link from "next/link";
import { SourceLink } from "./source-link";

export type SocialLink = {
	label: string;
	href: string;
};

export interface FooterProps {
	signature?: React.ReactNode;
	copyright?: React.ReactNode;
	socialLinks?: SocialLink[];
	navLinks?: { label: string; href: string }[];
	note?: React.ReactNode;
	className?: string;
}

const defaultSocialLinks: SocialLink[] = [
	{ label: "GitHub", href: "https://github.com/zeyaddeeb" },
	{ label: "LinkedIn", href: "https://linkedin.com/in/zeyaddeeb" },
	{ label: "Twitter", href: "https://twitter.com/zeyad_deeb" },
];

export function Footer({
	signature = "Zeyad Deeb",
	copyright = `© ${new Date().getFullYear()} Zeyad Deeb`,
	socialLinks = defaultSocialLinks,
	navLinks,
	note,
	className = "",
}: FooterProps) {
	return (
		<footer className={`border-t border-rule text-foreground ${className}`}>
			<div className="container grid gap-8 py-10 md:grid-cols-[1fr_auto] md:items-end">
				<div className="flex items-center gap-4">
					<span
						aria-hidden="true"
						className="block h-3 w-3 rounded-full bg-amber"
					/>
					<div>
						<p className="font-display text-sm font-medium tracking-tight">
							{signature}
						</p>
						<p className="mt-1 font-mono text-xs text-dim">{copyright}</p>
					</div>
				</div>

				<div className="flex flex-col gap-3 md:items-end">
					<p className="font-display text-base">
						<SourceLink>View this site’s source on GitHub</SourceLink>
					</p>
					{note ? <p className="font-mono text-xs text-dim">{note}</p> : null}
					<ul className="flex flex-wrap gap-5 font-display text-[13px] text-dim">
						{navLinks?.map((link) => (
							<li key={link.href}>
								<Link href={link.href} className="link-underline">
									{link.label}
								</Link>
							</li>
						))}
						{socialLinks.map((link) => (
							<li key={link.href}>
								<a
									href={link.href}
									target="_blank"
									rel="noopener noreferrer"
									className="link-underline"
								>
									{link.label}
								</a>
							</li>
						))}
					</ul>
				</div>
			</div>
		</footer>
	);
}
