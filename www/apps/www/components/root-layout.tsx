"use client";

import { Header, type NavItem } from "@zeyaddeeb/ui";
import { ReactLenis } from "lenis/react";
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
	const showHeader = pathname !== "/";

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
				{showHeader && <Header navItems={navItems} variant="solid" />}
				{children}
			</div>
			<IntroScreen onComplete={() => setIntroComplete(true)} />
			<CustomCursor />
		</ReactLenis>
	);
}
