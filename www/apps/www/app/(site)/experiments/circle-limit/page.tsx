import type { Metadata } from "next";
import CircleLimitGallery from "./gallery";

export const metadata: Metadata = {
	title: "Circle Limit | A Hyperbolic Exhibition",
	description:
		"An exhibition of M.C. Escher-style hyperbolic tessellations. Six plates of interlocking pinwheels in the Poincaré disk, generated in Rust/WASM by mirror reflection and set in perpetual Möbius drift.",
};

export default function CircleLimitPage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-amber-500/30 selection:text-amber-200">
			<section className="relative px-6 pt-32 pb-24 overflow-hidden">
				<div className="absolute inset-0 bg-linear-to-b from-stone-900/40 via-neutral-950 to-neutral-950" />
				<div className="absolute top-100 left-1/2 -translate-x-1/2 w-200 h-200 bg-amber-500/4 blur-[160px] rounded-full" />
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.12]"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
					}}
				/>

				<div className="relative z-10 mx-auto max-w-6xl">
					<header className="mb-20 text-center">
						<p className="mb-6 font-mono text-[10px] uppercase tracking-[0.5em] text-amber-500/70">
							A Hyperbolic Exhibition
						</p>
						<h1
							className="mb-6 text-[clamp(3rem,9vw,7rem)] font-bold uppercase leading-[0.9] tracking-tight"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Circle Limit
						</h1>
						<p className="mx-auto max-w-2xl font-serif text-base italic leading-relaxed text-neutral-400 md:text-lg">
							Six plates after M.C. Escher. In each, an infinite hyperbolic
							plane is pressed into a single disk. The motion is a Möbius
							transformation, so the pattern moves like hyperbolic space itself
							is turning.
						</p>
					</header>

					<CircleLimitGallery />
				</div>
			</section>
		</main>
	);
}
