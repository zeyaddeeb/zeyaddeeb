"use client";

import dynamic from "next/dynamic";

const AudioVisualizerCanvas = dynamic(() => import("./canvas"), {
	ssr: false,
	loading: () => (
		<div className="grid h-80 place-items-center border border-rule bg-charcoal font-mono text-xs text-dim">
			loading engine…
		</div>
	),
});

export function AudioLab() {
	return <AudioVisualizerCanvas />;
}
