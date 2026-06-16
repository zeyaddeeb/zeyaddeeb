import type { Metadata } from "next";
import Link from "next/link";
import FallingCode from "./falling-code";

export const metadata: Metadata = {
	title: "Falling Code | Pretext Experiment",
	description:
		"A Matrix-inspired rain field using @chenglou/pretext to shape falling glyph streams.",
};

export default function PretextMatrixPage() {
	return (
		<main className="min-h-screen bg-black text-white">
			<section className="relative min-h-screen overflow-hidden px-4 pt-24 pb-16 md:px-6 md:pt-32">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(34,197,94,0.13),transparent_30%),linear-gradient(180deg,#000_0%,#031208_52%,#000_100%)]" />
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.06]"
					style={{
						backgroundImage:
							"linear-gradient(rgba(134,239,172,0.8) 1px, transparent 1px)",
						backgroundSize: "100% 4px",
					}}
				/>

				<div className="relative z-10 mx-auto max-w-6xl">
					<Link
						href="/experiments"
						className="mb-8 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-green-300/70 transition-colors hover:text-green-200"
					>
						<span aria-hidden="true">{"<"}</span>
						Back to Experiments
					</Link>

					<header className="mb-8 max-w-3xl">
						<p className="mb-3 font-mono text-xs uppercase tracking-[0.42em] text-green-200/80">
							{`Operator signal // Pretext online`}
						</p>
						<h1
							className="mb-4 text-4xl font-black uppercase leading-none text-green-300 md:text-7xl"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Falling Code
						</h1>
						<p className="max-w-2xl text-sm leading-7 text-neutral-300 md:text-base">
							A sparse Matrix-inspired rain field. Pretext shapes each glyph
							stream before CSS sends it falling through the construct.
						</p>
					</header>

					<FallingCode />

					<div className="mt-6 grid gap-3 font-mono text-xs uppercase tracking-[0.18em] text-neutral-500 md:grid-cols-3">
						<div className="border border-neutral-800 bg-neutral-950/70 p-4">
							<span className="text-green-300">Engine</span>
							<br />
							@chenglou/pretext
						</div>
						<div className="border border-neutral-800 bg-neutral-950/70 p-4">
							<span className="text-green-300">Renderer</span>
							<br />
							DOM + CSS
						</div>
						<div className="border border-neutral-800 bg-neutral-950/70 p-4">
							<span className="text-green-300">Signal</span>
							<br />
							falling code field
						</div>
					</div>
				</div>
			</section>
		</main>
	);
}
