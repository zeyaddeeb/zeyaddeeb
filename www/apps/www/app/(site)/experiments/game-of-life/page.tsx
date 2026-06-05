import type { Metadata } from "next";
import GameOfLifeCanvas from "./canvas";

export const metadata: Metadata = {
	title: "Conway's Game of Life | WebAssembly Experiment",
	description:
		"High-performance interactive simulation of Conway's Game of Life in the browser. Powered by WebAssembly and Rust for ultra-fast calculations with a live JavaScript benchmark.",
};

export default function GameOfLifePage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-violet-500/30 selection:text-violet-300">
			<section className="relative px-6 pt-32 pb-20 overflow-hidden">
				<div className="absolute inset-0 bg-linear-to-br from-violet-950/20 via-neutral-950 to-neutral-950" />
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-violet-500/5 blur-[120px] rounded-full" />
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.1]"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
					}}
				/>

				<div className="relative z-10 mx-auto max-w-6xl">
					<header className="mb-12">
						<h1
							className="mb-4 text-4xl font-black uppercase tracking-tight md:text-6xl"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Game of Life
						</h1>
						<p className="max-w-2xl text-base text-neutral-400 md:text-lg">
							An interactive WebAssembly experiment. Compute cells in Rust
							compiled to WASM and render them via dynamic Canvas loops. Switch
							engines in real-time to benchmark WebAssembly vs JavaScript
							computation times.
						</p>
					</header>

					<GameOfLifeCanvas />

					<footer className="mt-16 grid gap-8 border-t border-neutral-950 pt-10 md:grid-cols-2 text-neutral-400">
						<div className="space-y-3">
							<h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 font-mono">
								The Rules of Conway's Life
							</h3>
							<ul className="list-disc list-inside space-y-2 text-xs">
								<li>
									<strong className="text-neutral-300">Underpopulation:</strong>{" "}
									Any live cell with fewer than two live neighbors dies.
								</li>
								<li>
									<strong className="text-neutral-300">Survival:</strong> Any
									live cell with two or three live neighbors survives to the
									next generation.
								</li>
								<li>
									<strong className="text-neutral-300">Overpopulation:</strong>{" "}
									Any live cell with more than three live neighbors dies.
								</li>
								<li>
									<strong className="text-neutral-300">Reproduction:</strong>{" "}
									Any dead cell with exactly three live neighbors becomes alive.
								</li>
							</ul>
						</div>
						<div className="space-y-3">
							<h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-300 font-mono">
								WebAssembly vs JavaScript
							</h3>
							<p className="text-xs leading-relaxed">
								This experiment highlights performance differences when running
								logic in WebAssembly compared to pure JavaScript. Conway's Game
								of Life requires updating every grid cell by inspecting its
								neighbor values.
							</p>
							<p className="text-xs leading-relaxed">
								By using a flat buffer structure in Rust, calculations run
								natively in a compiled, low-overhead environment. In JavaScript,
								we can copy these cells out of WASM linear memory into arrays
								without high overhead, keeping the canvas rendering fluid at 60
								FPS even on large resolutions.
							</p>
						</div>
					</footer>
				</div>
			</section>
		</main>
	);
}
