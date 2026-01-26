"use client";

import { ReactLenis } from "lenis/react";
import { useState } from "react";
import { CustomCursor } from "@/components/custom-cursor";
import { IntroScreen } from "./intro-screen";

interface RootLayoutClientProps {
	children: React.ReactNode;
}

export function RootLayoutClient({ children }: RootLayoutClientProps) {
	const [introComplete, setIntroComplete] = useState(false);

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
				{children}
			</div>
			<IntroScreen onComplete={() => setIntroComplete(true)} />
			<CustomCursor />
		</ReactLenis>
	);
}
