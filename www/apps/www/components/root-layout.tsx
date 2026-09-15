"use client";

import { MotionConfig } from "framer-motion";
import { PresenceProvider } from "@/features/live/presence";
import { RunningProvider } from "@/features/live/running-context";

interface RootLayoutClientProps {
	children: React.ReactNode;
}

export function RootLayoutClient({ children }: RootLayoutClientProps) {
	return (
		<MotionConfig reducedMotion="user">
			<RunningProvider>
				<PresenceProvider>
					<span className="site-progress" aria-hidden="true" />
					<div className="min-h-screen">{children}</div>
				</PresenceProvider>
			</RunningProvider>
		</MotionConfig>
	);
}
