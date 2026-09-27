"use client";

import { MotionConfig } from "framer-motion";
import { PresenceProvider } from "@/features/live/presence";

interface RootLayoutClientProps {
	children: React.ReactNode;
}

export function RootLayoutClient({ children }: RootLayoutClientProps) {
	return (
		<MotionConfig reducedMotion="user">
			<PresenceProvider>
				<span className="site-progress" aria-hidden="true" />
				<div className="min-h-screen">{children}</div>
			</PresenceProvider>
		</MotionConfig>
	);
}
