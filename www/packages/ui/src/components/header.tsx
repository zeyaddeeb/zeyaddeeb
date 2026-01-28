"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export type NavItem = {
	label?: string;
	href: string;
	external?: boolean;
	primary?: boolean;
	icon?: React.ReactNode;
	ariaLabel?: string;
};

export interface HeaderProps {
	activeSection?: string;
	navItems?: NavItem[];
	logo?: React.ReactNode;
	logoHref?: string;
	variant?: "transparent" | "solid";
	className?: string;
}

const defaultNavItems: NavItem[] = [{ label: "Blog", href: "/blog" }];

export function Header({
	activeSection,
	navItems = defaultNavItems,
	logo = "Z",
	logoHref = "/",
	variant = "transparent",
	className = "",
}: HeaderProps) {
	const baseClasses =
		variant === "solid"
			? "fixed left-0 right-0 top-0 z-50 border-b border-neutral-800/50 bg-neutral-950/80 backdrop-blur-xl"
			: "fixed left-0 right-0 top-0 z-50";

	return (
		<motion.header
			initial={{ y: -20, opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
			className={`${baseClasses} ${className}`}
		>
			<nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
				<Link
					href={logoHref}
					onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
					className="text-xl font-bold uppercase tracking-tight text-white transition-colors hover:text-neutral-300"
					style={{ fontFamily: "var(--font-anton, inherit)" }}
				>
					{logo}
				</Link>

				<div className="flex items-center gap-1 md:gap-2">
					{navItems.map((item) => {
						const isActive = activeSection === item.href;
						return (
							<Link
								key={item.href}
								href={item.href}
								target={item.external ? "_blank" : undefined}
								rel={item.external ? "noopener noreferrer" : undefined}
								title={item.label || item.ariaLabel || undefined}
								aria-label={item.ariaLabel || item.label || undefined}
								className={`rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all focus:outline-none md:px-4 md:py-2 md:text-sm ${
									item.primary
										? "border border-white bg-white text-neutral-900 hover:bg-transparent hover:text-white"
										: isActive
											? "bg-neutral-800 text-white"
											: "text-neutral-300 hover:bg-neutral-800 hover:text-white"
								}`}
							>
								{item.icon && !item.label && <span>{item.icon}</span>}
								{item.icon && item.label && (
									<span className="md:hidden">{item.icon}</span>
								)}
								{item.label && (
									<span className={item.icon ? "hidden md:inline" : ""}>
										{item.label}
									</span>
								)}
							</Link>
						);
					})}
				</div>
			</nav>
		</motion.header>
	);
}
