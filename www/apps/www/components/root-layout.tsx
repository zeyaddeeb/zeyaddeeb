"use client";

import { ReactLenis } from "lenis/react";
import { CustomCursor } from "@/components/custom-cursor";
import { IntroScreen } from "./intro-screen";

interface RootLayoutClientProps {
	children: React.ReactNode;
}

export function RootLayoutClient({ children }: RootLayoutClientProps) {
	return (
		<ReactLenis
			root
			options={{
				lerp: 0.1,
				duration: 1.4,
			}}
		>
			<main>{children}</main>
			<IntroScreen />
			<CustomCursor />
		</ReactLenis>
	);
}
