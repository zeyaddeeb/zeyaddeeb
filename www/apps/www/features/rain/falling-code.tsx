"use client";

import { useCallback, useState } from "react";
import { RainView } from "@/features/rain/rain-view";

const btn =
	"border border-rule px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-paper-2 transition-colors hover:border-rule-strong hover:text-paper";

export default function FallingCode() {
	const [density, setDensity] = useState(72);
	const [paused, setPaused] = useState(false);
	const [layout, setLayout] = useState<[number, number] | null>(null);
	const onLayout = useCallback((c: number, l: number) => setLayout([c, l]), []);

	return (
		<div className="border border-rule bg-charcoal">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
				<p className="eyebrow">
					pretext.rain
					{layout ? ` · ${layout[0]} streams · ${layout[1]} lines` : ""}
				</p>
				<div className="flex items-center gap-4">
					<label className="eyebrow flex items-center gap-2">
						density
						<input
							className="w-28 accent-amber"
							type="range"
							min={30}
							max={126}
							step={6}
							value={density}
							onChange={(e) => setDensity(Number(e.target.value))}
						/>
					</label>
					<button
						type="button"
						className={btn}
						onClick={() => setPaused((p) => !p)}
					>
						{paused ? "Resume" : "Pause"}
					</button>
				</div>
			</div>
			<RainView
				density={density}
				paused={paused}
				onLayout={onLayout}
				className="h-[70vh] min-h-[480px]"
			/>
		</div>
	);
}
