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
							plane is pressed into a single disk — thousands of interlocking
							pinwheels grown by mirror reflection in Rust and WebAssembly,
							every other one spinning the opposite way, all of them adrift on a
							perpetual Möbius current. The plate on view hangs inside
							Escher&apos;s <em>Stars</em>: an openwork cage of three
							interlocked octahedra tumbling in the void, the tessellation
							wrapped around the sphere at its heart.
						</p>
					</header>

					<CircleLimitGallery />

					<footer className="mt-28 grid gap-10 border-t border-neutral-800/80 pt-12 md:grid-cols-2 text-neutral-400">
						<div className="space-y-3">
							<h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-300">
								Escher &amp; Hyperbolic Geometry
							</h3>
							<p className="text-xs leading-relaxed">
								Between 1958 and 1960 Escher carved four woodcuts — Circle Limit
								I through IV — after the geometer H.S.M. Coxeter sent him a
								figure of a hyperbolic tessellation. Fish, angels, and devils
								repeat forever toward the rim of a disk, each one the same size
								in hyperbolic terms yet shrinking endlessly to our Euclidean
								eyes.
							</p>
							<p className="text-xs leading-relaxed">
								This is the Poincaré disk model: the entire infinite hyperbolic
								plane mapped inside a unit circle. Straight lines become
								circular arcs that meet the boundary at right angles, and the
								boundary itself lies infinitely far away. A regular tiling of
								p-sided polygons meeting q per corner — the Schläfli symbol{" "}
								{"{p,q}"} — exists in hyperbolic space whenever
								(p&minus;2)(q&minus;2) &gt; 4, which is why three heptagons can
								meet at a corner here but never on a flat sheet of paper.
							</p>
						</div>
						<div className="space-y-3">
							<h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-300">
								How It&apos;s Computed
							</h3>
							<p className="text-xs leading-relaxed">
								Rust constructs one central polygon carrying a pinwheel motif,
								then breadth-first reflects it across its own edges — circle
								inversions in arcs orthogonal to the disk — deduplicating tiles
								by their hyperbolic centers until thousands of copies fill the
								disk down to sub-pixel size. The motif points ride along through
								every reflection, which is why neighboring pinwheels swirl in
								opposite directions and their blade tips meet at the edge
								midpoints in unbroken S-curves.
							</p>
							<p className="text-xs leading-relaxed">
								Nothing is ever regenerated after that. The perpetual drift is a
								single Möbius transformation z &rarr; (az&nbsp;+&nbsp;b) /
								(b&#773;z&nbsp;+&nbsp;a&#773;) — the rigid motion of hyperbolic
								space — applied in WebAssembly to every point of every tile, on
								every plate, every frame: hundreds of thousands of complex
								divisions per frame, the kind of arithmetic-dense hot loop Rust
								compiled to WASM eats for breakfast.
							</p>
							<p className="text-xs leading-relaxed">
								The piece on view rebuilds Escher&apos;s 1948 wood engraving{" "}
								<em>Stars</em> in Three.js: the compound of three octahedra —
								the same frame rotated 45&deg; about each coordinate axis, every
								edge a beam, every face left open, each octahedron cut in its
								own shade like Escher&apos;s three-color maquette. Where he
								caged chameleons, this cage holds the hyperbolic plane: the
								freshly drawn disk wrapped around a sphere by inverse
								stereographic projection, one mirrored copy per hemisphere,
								drifting on its Möbius current and lighting the beams from
								inside.
							</p>
						</div>
					</footer>
				</div>
			</section>
		</main>
	);
}
