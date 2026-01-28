"use client";

import { Header, type NavItem } from "@zeyaddeeb/ui";
import { ReactLenis } from "lenis/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { CustomCursor } from "@/components/custom-cursor";
import { IntroScreen } from "./intro-screen";

interface RootLayoutClientProps {
	children: React.ReactNode;
	navItems: NavItem[];
}

export function RootLayoutClient({
	children,
	navItems,
}: RootLayoutClientProps) {
	const [introComplete, setIntroComplete] = useState(false);
	const pathname = usePathname();
	const isRootPage = pathname === "/";

	return (
		<ReactLenis
			root
			options={{
				lerp: 0.1,
				duration: 1.4,
			}}
		>
			<div
				className="min-h-screen bg-neutral-950"
				style={{ opacity: introComplete ? 1 : 0 }}
			>
				{isRootPage ? (
					<Link
						href="/"
						className="fixed left-4 top-4 z-50 text-xl font-bold uppercase tracking-tight text-white transition-colors hover:text-neutral-300 md:hidden"
						style={{ fontFamily: "var(--font-anton, inherit)" }}
					>
						Z
					</Link>
				) : (
					<Header navItems={navItems} variant="solid" />
				)}
				{children}
			</div>
			<IntroScreen onComplete={() => setIntroComplete(true)} />
			<CustomCursor />
		</ReactLenis>
	);
}
