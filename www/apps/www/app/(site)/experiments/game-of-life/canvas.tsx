"use client";

import { useCallback, useRef, useState } from "react";
import type { LifeBackend, LifeStats } from "@/features/life/engine";
import { type LifeHandle, LifeView } from "@/features/life/life-view";
import { useReducedMotion } from "@/features/live/use-running";
import { useWasm } from "@/lib/hooks/use-wasm";
import { PRESETS } from "./presets";

const SIZES = {
	small: { cols: 64, rows: 40 },
	medium: { cols: 96, rows: 60 },
	large: { cols: 128, rows: 80 },
	xl: { cols: 160, rows: 100 },
} as const;

type SizeKey = keyof typeof SIZES;

const btn =
	"border border-rule px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-paper-2 transition-colors hover:border-rule-strong hover:text-paper disabled:opacity-40 disabled:hover:border-rule";
const btnOn = "border-amber text-amber hover:border-amber hover:text-amber";

export default function GameOfLifeLab() {
	const { loading, error } = useWasm();
	const ref = useRef<LifeHandle>(null);

	const [size, setSize] = useState<SizeKey>("medium");
	const reduced = useReducedMotion();
	const [playback, setRunning] = useState<boolean | null>(null);
	const running = playback ?? !reduced;
	const [backend, setBackend] = useState<LifeBackend>("wasm");
	const [tickMs, setTickMs] = useState(700);
	const [drawMode, setDrawMode] = useState<"draw" | "erase">("draw");
	const [showGrid, setShowGrid] = useState(false);
	const [trails, setTrails] = useState(true);
	const [stats, setStats] = useState<(LifeStats & { fps: number }) | null>(
		null,
	);
	const [hasWasm, setHasWasm] = useState<boolean | null>(null);

	const onStats = useCallback(
		(s: LifeStats & { fps: number }) => setStats(s),
		[],
	);
	const onReady = useCallback((w: boolean) => setHasWasm(w), []);

	const { cols, rows } = SIZES[size];

	if (error) {
		return (
			<p className="font-mono text-sm text-destructive">
				The WebAssembly module failed to load: {error}
			</p>
		);
	}

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
			<div className="border border-rule bg-charcoal">
				<div className="aspect-[8/5] w-full">
					{loading ? (
						<div className="grid h-full place-items-center font-mono text-xs text-dim">
							loading engine…
						</div>
					) : (
						<LifeView
							ref={ref}
							cols={cols}
							rows={rows}
							running={running}
							tickMs={tickMs}
							backend={hasWasm ? backend : "js"}
							interactive
							drawMode={drawMode}
							showGrid={showGrid}
							trails={trails}
							onStats={onStats}
							onReady={onReady}
							className="h-full w-full"
						/>
					)}
				</div>
				<dl className="grid grid-cols-2 gap-px border-t border-rule bg-rule font-mono text-xs sm:grid-cols-4">
					{[
						["generation", stats?.generation.toLocaleString() ?? "—"],
						["alive", stats?.population.toLocaleString() ?? "—"],
						["peak", stats?.peak.toLocaleString() ?? "—"],
						[
							"tick",
							stats
								? `${stats.tickMicros.toFixed(0)} µs · ${stats.fps} fps`
								: "—",
						],
					].map(([k, v]) => (
						<div key={k} className="bg-charcoal px-4 py-3">
							<dt className="text-dim">{k}</dt>
							<dd className="mt-1 text-paper">{v}</dd>
						</div>
					))}
				</dl>
			</div>

			<aside className="grid gap-6 lg:sticky lg:top-20">
				<section className="grid gap-3">
					<h2 className="eyebrow">Simulation</h2>
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className={`${btn} ${running ? btnOn : ""}`}
							onClick={() => setRunning(!running)}
						>
							{running ? "Pause" : "Play"}
						</button>
						<button
							type="button"
							className={btn}
							disabled={running}
							onClick={() => ref.current?.step()}
						>
							Step
						</button>
						<button
							type="button"
							className={btn}
							onClick={() => ref.current?.randomize()}
						>
							Randomize
						</button>
						<button
							type="button"
							className={btn}
							onClick={() => ref.current?.clear()}
						>
							Clear
						</button>
					</div>
					<label className="grid gap-1 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
						<span className="flex justify-between">
							<span>Tick delay</span>
							<span className="text-paper">{tickMs} ms</span>
						</span>
						<input
							type="range"
							min={0}
							max={2000}
							step={10}
							value={tickMs}
							onChange={(e) => setTickMs(Number(e.target.value))}
							className="accent-amber"
						/>
					</label>
				</section>

				<section className="grid gap-3">
					<h2 className="eyebrow">Engine</h2>
					<div className="flex gap-2">
						<button
							type="button"
							className={`${btn} ${backend === "wasm" ? btnOn : ""}`}
							disabled={hasWasm === false}
							onClick={() => setBackend("wasm")}
						>
							Rust / WASM
						</button>
						<button
							type="button"
							className={`${btn} ${backend === "js" ? btnOn : ""}`}
							onClick={() => setBackend("js")}
						>
							JavaScript
						</button>
					</div>
					<p className="font-mono text-[11px] leading-relaxed text-dim">
						Same rules, same buffers. Watch the tick time change.
					</p>
				</section>

				<section className="grid gap-3">
					<h2 className="eyebrow">Brush</h2>
					<div className="flex gap-2">
						<button
							type="button"
							className={`${btn} ${drawMode === "draw" ? btnOn : ""}`}
							onClick={() => setDrawMode("draw")}
						>
							Draw
						</button>
						<button
							type="button"
							className={`${btn} ${drawMode === "erase" ? btnOn : ""}`}
							onClick={() => setDrawMode("erase")}
						>
							Erase
						</button>
					</div>
				</section>

				<section className="grid gap-3">
					<h2 className="eyebrow">Grid</h2>
					<div className="flex flex-wrap gap-2">
						{(Object.keys(SIZES) as SizeKey[]).map((k) => (
							<button
								key={k}
								type="button"
								className={`${btn} ${size === k ? btnOn : ""}`}
								onClick={() => setSize(k)}
							>
								{SIZES[k].cols}×{SIZES[k].rows}
							</button>
						))}
					</div>
					<div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={showGrid}
								onChange={(e) => setShowGrid(e.target.checked)}
								className="accent-amber"
							/>
							Grid lines
						</label>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={trails}
								onChange={(e) => setTrails(e.target.checked)}
								className="accent-amber"
							/>
							Trails
						</label>
					</div>
				</section>

				<section className="grid gap-3">
					<h2 className="eyebrow">Patterns</h2>
					<ul className="grid gap-px border border-rule bg-rule">
						{Object.entries(PRESETS).map(([key, p]) => (
							<li key={key} className="bg-charcoal">
								<button
									type="button"
									onClick={() => ref.current?.loadPattern(p.cells)}
									className="grid w-full gap-1 px-4 py-3 text-left transition-colors hover:bg-charcoal-2"
								>
									<span className="font-display text-sm font-medium text-paper">
										{p.name}
									</span>
									<span className="font-serif text-sm text-dim">
										{p.description}
									</span>
								</button>
							</li>
						))}
					</ul>
				</section>
			</aside>
		</div>
	);
}
