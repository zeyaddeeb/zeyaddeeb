"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export type SocialLink = {
	label: string;
	href: string;
	icon?: React.ReactNode;
};

export interface FooterProps {
	copyright?: React.ReactNode;
	socialLinks?: SocialLink[];
	navLinks?: { label: string; href: string }[];
	animate?: boolean;
	className?: string;
}

const defaultSocialLinks: SocialLink[] = [
	{ label: "GitHub", href: "https://github.com/zeyaddeeb" },
	{ label: "LinkedIn", href: "https://linkedin.com/in/zeyaddeeb" },
	{ label: "Twitter", href: "https://twitter.com/zeyad_deeb" },
];

export function Footer({
	copyright = `© ${new Date().getFullYear()} Zeyad Deeb. All rights reserved.`,
	socialLinks = defaultSocialLinks,
	navLinks,
	animate = true,
	className = "",
}: FooterProps) {
	const Wrapper = animate ? motion.footer : "footer";
	const animationProps = animate
		? {
				initial: { opacity: 0 },
				whileInView: { opacity: 1 },
				viewport: { once: true },
				transition: { duration: 0.6 },
			}
		: {};

	return (
		<Wrapper
			{...animationProps}
			className={`border-t border-neutral-800 px-4 py-8 md:px-6 ${className}`}
		>
			<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-neutral-500 md:flex-row">
				<p>{copyright}</p>

				<div className="flex flex-wrap items-center justify-center gap-6">
					{navLinks?.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							className="uppercase tracking-widest transition-colors hover:text-white"
						>
							{link.label}
						</Link>
					))}

					{socialLinks.map((link) => (
						<a
							key={link.href}
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							className="uppercase tracking-widest transition-colors hover:text-white"
						>
							{link.icon || link.label}
						</a>
					))}
				</div>
			</div>
		</Wrapper>
	);
}
