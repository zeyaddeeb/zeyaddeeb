"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const experiments = [
	{
		title: "WASM Audio Visualizer",
		description:
			"Real-time audio visualization powered by WebAssembly. FFT processing in Rust with Canvas rendering.",
		href: "/experiments/audio-visualizer",
		tags: ["WebAssembly", "Rust", "Web Audio API"],
		gradient: "from-violet-500 to-pink-500",
	},
];

export default function ExperimentsPage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white">
			<section className="relative min-h-screen px-6 pt-42 pb-20 overflow-hidden">
				<div className="absolute inset-0 bg-linear-to-br from-indigo-950 via-neutral-950 to-neutral-950" />
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-violet-500/10 blur-[150px] rounded-full" />
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.15]"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
					}}
				/>

				<div className="relative z-10 mx-auto max-w-6xl">
					<motion.div
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
						className="text-center mb-16"
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
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 40 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, delay: 0.2 }}
						className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
					>
						{experiments.map((experiment) => (
							<Link
								key={experiment.href}
								href={experiment.href}
								className="group relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 transition-all duration-300 hover:border-neutral-700 hover:bg-neutral-900/80"
							>
								<div
									className={`absolute inset-0 bg-linear-to-br ${experiment.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-5`}
								/>

								<div className="relative">
									<div
										className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-linear-to-br ${experiment.gradient} bg-opacity-20`}
									>
										<svg
											className="h-6 w-6 text-white"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											aria-hidden="true"
										>
											<title>Audio</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
											/>
										</svg>
									</div>

									<h3 className="mb-2 text-xl font-semibold transition-colors group-hover:text-violet-400">
										{experiment.title}
									</h3>

									<p className="mb-4 text-sm text-neutral-400">
										{experiment.description}
									</p>

									<div className="flex flex-wrap gap-2">
										{experiment.tags.map((tag) => (
											<span
												key={tag}
												className="rounded-full bg-neutral-800/50 px-3 py-1 text-xs text-neutral-400"
											>
												{tag}
											</span>
										))}
									</div>

									<div className="absolute top-6 right-6 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-1">
										<svg
											className="h-5 w-5 text-violet-400"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											aria-hidden="true"
										>
											<title>Arrow</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M17 8l4 4m0 0l-4 4m4-4H3"
											/>
										</svg>
									</div>
								</div>
							</Link>
						))}

						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.4 }}
							className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/20 p-6 text-center"
						>
							<div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-800/50">
								<svg
									className="h-6 w-6 text-neutral-500"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<title>Plus</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M12 6v6m0 0v6m0-6h6m-6 0H6"
									/>
								</svg>
							</div>
							<span className="text-sm text-neutral-500">
								More coming soon...
							</span>
						</motion.div>
					</motion.div>
				</div>
			</section>
		</main>
	);
}
