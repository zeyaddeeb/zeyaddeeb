"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BLOG_URL } from "../urls";

export type NavItem = {
	label: string;
	href: string;
	external?: boolean;
};

export interface HeaderProps {
	navItems?: NavItem[];
	wordmark?: React.ReactNode;
	logoHref?: string;
	status?: React.ReactNode;
	className?: string;
}

const defaultNavItems: NavItem[] = [{ label: "Blog", href: BLOG_URL }];

export function Header({
	navItems = defaultNavItems,
	wordmark = "Zeyad Deeb",
	logoHref = "/",
	status,
	className = "",
}: HeaderProps) {
	const pathname = usePathname();

	return (
		<header
			className={`sticky top-0 z-40 border-b border-rule bg-background text-foreground ${className}`}
		>
			<nav className="container flex h-14 items-center gap-3 sm:gap-6">
				<Link
					href={logoHref}
					className="flex shrink-0 items-center gap-2 font-display text-[14px] sm:gap-3 sm:text-[15px] font-medium tracking-tight"
				>
					{wordmark}
				</Link>

				{status ? (
					<div className="hidden min-w-0 flex-1 items-center md:flex">
						{status}
					</div>
				) : (
					<div className="flex-1" />
				)}

				<ul className="flex items-center gap-3 font-display text-[12px] sm:gap-5 sm:text-[13px]">
					{navItems.map((item) => {
						const active =
							!item.external &&
							(pathname === item.href ||
								(item.href !== "/" && pathname?.startsWith(`${item.href}/`)));
						return (
							<li key={item.href}>
								<Link
									href={item.href}
									target={item.external ? "_blank" : undefined}
									rel={item.external ? "noopener noreferrer" : undefined}
									aria-current={active ? "page" : undefined}
									className={`underline-offset-[6px] transition-colors ease-quiet [transition-duration:var(--dur-1)] hover:text-foreground ${
										active
											? "text-foreground underline decoration-amber decoration-1"
											: "text-dim"
									}`}
								>
									{item.label}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
		</header>
	);
}
