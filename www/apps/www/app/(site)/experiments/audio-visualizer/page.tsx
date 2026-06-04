"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";

const AudioVisualizerCanvas = dynamic(() => import("./canvas"), {
	ssr: false,
	loading: () => (
		<div className="flex h-80 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900/50 md:h-125">
			<div className="flex flex-col items-center gap-4">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
				<span className="text-sm text-neutral-400">Loading WASM module...</span>
			</div>
		</div>
	),
});

export default function AudioVisualizerPage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white">
			<section className="relative min-h-screen px-4 pt-24 pb-20 md:px-6 md:pt-32 md:pb-20">
				<div className="absolute inset-0 bg-linear-to-br from-violet-950/30 via-neutral-950 to-neutral-950" />
				<div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-[150px] md:h-150 md:w-150" />
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.08]"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
					}}
				/>

				<div className="relative z-10 mx-auto max-w-6xl">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6 }}
						className="mb-8 md:mb-12"
					>
						<Link
							href="/experiments"
							className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white md:mb-6"
						>
							<svg
								className="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								aria-hidden="true"
							>
								<title>Back</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 19l-7-7 7-7"
								/>
							</svg>
							Back to Experiments
						</Link>

						<h1
							className="mb-4 text-3xl font-bold md:text-6xl"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							WASM Audio Visualizer
						</h1>

						<p className="max-w-2xl text-base text-neutral-400 md:text-lg">
							Real-time audio visualization powered by WebAssembly. Uses FFT
							(Fast Fourier Transform) computed in Rust/WASM for
							high-performance frequency analysis of audio input.
						</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, delay: 0.1 }}
						className="mb-6 flex flex-wrap gap-2 md:mb-8 md:gap-3"
					>
						{["WebAssembly", "Rust", "Web Audio API", "Canvas", "FFT"].map(
							(tech) => (
								<span
									key={tech}
									className="rounded-full border border-neutral-700 bg-neutral-900/50 px-3 py-1 text-xs uppercase tracking-wider text-neutral-300 md:px-4 md:py-1.5"
								>
									{tech}
								</span>
							),
						)}
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, delay: 0.2 }}
					>
						<AudioVisualizerCanvas />
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, delay: 0.3 }}
						className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3 md:gap-8"
					>
						<div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 md:p-6">
							<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20 md:mb-4 md:h-12 md:w-12">
								<svg
									className="h-5 w-5 text-violet-400 md:h-6 md:w-6"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<title>Audio Capture</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
									/>
								</svg>
							</div>
							<h3 className="mb-2 text-base font-semibold md:text-lg">
								Audio Capture
							</h3>
							<p className="text-xs text-neutral-400 md:text-sm">
								Uses the Web Audio API to capture microphone input in real-time,
								streaming audio samples to the WASM module.
							</p>
						</div>

						<div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 md:p-6">
							<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/20 md:mb-4 md:h-12 md:w-12">
								<svg
									className="h-5 w-5 text-indigo-400 md:h-6 md:w-6"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<title>FFT Processing</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
									/>
								</svg>
							</div>
							<h3 className="mb-2 text-base font-semibold md:text-lg">
								WASM FFT Processing
							</h3>
							<p className="text-xs text-neutral-400 md:text-sm">
								Rust-compiled WebAssembly performs Fast Fourier Transform to
								convert time-domain audio into frequency spectrum data.
							</p>
						</div>

						<div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 md:p-6">
							<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/20 md:mb-4 md:h-12 md:w-12">
								<svg
									className="h-5 w-5 text-pink-400 md:h-6 md:w-6"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<title>Canvas Rendering</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
									/>
								</svg>
							</div>
							<h3 className="mb-2 text-base font-semibold md:text-lg">
								Canvas Rendering
							</h3>
							<p className="text-xs text-neutral-400 md:text-sm">
								Frequency data is visualized using HTML5 Canvas with smooth
								animations and gradient effects at 60fps.
							</p>
						</div>
					</motion.div>
				</div>
			</section>
		</main>
	);
}
