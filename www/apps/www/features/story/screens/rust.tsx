"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { LifeStats } from "@/features/life/engine";
import { LifeView } from "@/features/life/life-view";
import { useShouldRun } from "@/features/live/use-running";
import { useWasm } from "@/lib/hooks/use-wasm";

const COLS = 96;
const ROWS = 54;

export function RustScreen() {
	const wrapRef = useRef<HTMLDivElement>(null);
	const running = useShouldRun(wrapRef);
	const { loading, error } = useWasm();
	const [stats, setStats] = useState<LifeStats | null>(null);
	const onStats = useCallback((s: LifeStats & { fps: number }) => {
		setStats(s);
	}, []);

	return (
		<div className="rust" ref={wrapRef}>
			{error ? (
				<p className="rust__note">
					WebAssembly didn’t load here. The Rust is on{" "}
					<Link href="/experiments/game-of-life" className="link-underline">
						the Game of Life page
					</Link>
					.
				</p>
			) : loading ? (
				<p className="rust__note">Loading life.wasm…</p>
			) : (
				<LifeView
					cols={COLS}
					rows={ROWS}
					running={running}
					tickMs={110}
					maxFps={30}
					interactive
					seedProbability={0.14}
					onStats={onStats}
					className="rust__life"
				/>
			)}
			<p className="rust__status" aria-live="off">
				<span>fn tick(&amp;mut self) → wasm32</span>
				<span>
					{stats
						? `gen ${stats.generation.toLocaleString("en-US")} · pop ${stats.population.toLocaleString("en-US")} · ${(stats.tickMicros / 1000).toFixed(2)} ms`
						: "—"}
				</span>
			</p>
		</div>
	);
}
