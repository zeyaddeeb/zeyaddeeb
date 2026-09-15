"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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
	const [openPath, setOpenPath] = useState<string | null | undefined>(
		undefined,
	);
	const menuOpen = openPath !== undefined && openPath === pathname;
	const menuId = useId();
	const headerRef = useRef<HTMLElement>(null);
	const toggleRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			setOpenPath(undefined);
			toggleRef.current?.focus();
		};
		const closeOutside = (event: PointerEvent) => {
			if (!headerRef.current?.contains(event.target as Node)) {
				setOpenPath(undefined);
			}
		};
		document.addEventListener("keydown", closeOnEscape);
		document.addEventListener("pointerdown", closeOutside);
		return () => {
			document.removeEventListener("keydown", closeOnEscape);
			document.removeEventListener("pointerdown", closeOutside);
		};
	}, [menuOpen]);

	return (
		<header
			ref={headerRef}
			className={`sticky top-0 z-40 border-b border-rule bg-background text-foreground ${className}`}
		>
			<nav
				aria-label="Main navigation"
				className="container flex h-14 items-center gap-3 sm:gap-6"
			>
				<Link
					href={logoHref}
					onClick={() => setOpenPath(undefined)}
					className="flex shrink-0 items-center gap-2 font-display text-[14px] sm:gap-3 sm:text-[15px] font-medium tracking-tight"
				>
					{wordmark}
				</Link>

				{status ? (
					<div
						data-nosnippet=""
						className="hidden min-w-0 flex-1 items-center md:flex"
					>
						{status}
					</div>
				) : (
					<div className="flex-1" />
				)}

				<button
					ref={toggleRef}
					type="button"
					className="site-menu-toggle hidden"
					aria-expanded={menuOpen}
					aria-controls={menuId}
					onClick={() => setOpenPath(menuOpen ? undefined : pathname)}
				>
					{menuOpen ? "Close" : "Menu"}
					<svg
						aria-hidden="true"
						width="18"
						height="18"
						viewBox="0 0 18 18"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
					>
						<path d={menuOpen ? "M4 4l10 10M14 4L4 14" : "M2 6h14M2 12h14"} />
					</svg>
				</button>
				<ul
					id={menuId}
					data-open={menuOpen}
					className="flex items-center gap-3 font-display text-[12px] sm:gap-5 sm:text-[13px]"
				>
					{navItems.map((item) => {
						const active =
							!item.external &&
							(pathname === item.href ||
								(item.href !== "/" && pathname?.startsWith(`${item.href}/`)));
						return (
							<li key={item.href}>
								<Link
									href={item.href}
									onClick={() => setOpenPath(undefined)}
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
