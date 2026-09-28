"use client";

import { MotionConfig } from "framer-motion";
import { PresenceProvider } from "@/features/live/presence";
import { SiteProgress } from "./site-progress";

interface RootLayoutClientProps {
	children: React.ReactNode;
}

export function RootLayoutClient({ children }: RootLayoutClientProps) {
	return (
		<MotionConfig reducedMotion="user">
			<PresenceProvider>
				<SiteProgress />
				<div className="min-h-screen">{children}</div>
			</PresenceProvider>
		</MotionConfig>
	);
}
