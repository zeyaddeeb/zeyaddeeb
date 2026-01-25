"use client";

import { motion } from "framer-motion";

export default function ExperimentsPage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white">
			<section className="relative flex min-h-screen items-center justify-center px-6 py-20 overflow-hidden">
				<div className="absolute inset-0 bg-linear-to-br from-indigo-950 via-neutral-950 to-neutral-950" />
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-violet-500/10 blur-[150px] rounded-full" />
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.15]"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
					}}
				/>

				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
					className="relative z-10 text-center"
				>
					<h1
						className="mb-6 text-[clamp(3rem,10vw,8rem)] font-bold uppercase leading-[0.9] tracking-tight"
						style={{ fontFamily: "var(--font-anton)" }}
					>
						Experiments
					</h1>

					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.3, duration: 0.8 }}
						className="mx-auto max-w-2xl text-lg text-neutral-400 md:text-xl"
					>
						Creative explorations and interactive experiments
					</motion.p>

					<motion.div
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.5, duration: 0.8 }}
						className="mt-12 inline-flex items-center gap-3 rounded-full border border-neutral-700 bg-neutral-900/50 px-8 py-4"
					>
						<span className="relative flex h-3 w-3">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
							<span className="relative inline-flex h-3 w-3 rounded-full bg-yellow-500" />
						</span>
						<span className="text-sm uppercase tracking-widest text-neutral-400">
							Coming Soon
						</span>
					</motion.div>
				</motion.div>
			</section>
		</main>
	);
}
