"use client";

import { motion } from "framer-motion";

export default function AboutPage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white">
			<section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-24 pb-20">
				<div
					className="absolute inset-0"
					style={{
						background:
							"linear-gradient(135deg, #132118 0%, #080a08 48%, #050505 100%)",
					}}
				/>
				<div
					className="absolute top-0 left-0 h-150 w-150 rounded-full blur-[120px]"
					style={{ backgroundColor: "rgba(127, 157, 111, 0.14)" }}
				/>
				<div
					className="pointer-events-none absolute inset-0 opacity-[0.15]"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
					}}
				/>

				<div className="relative z-10 mx-auto max-w-4xl">
					<motion.div
						initial={{ opacity: 0, y: 30 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
					>
						<h1
							className="mb-8 text-[clamp(3rem,10vw,8rem)] font-bold uppercase leading-[0.9] tracking-normal"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							About Me
						</h1>
					</motion.div>

					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
						className="space-y-6"
					>
						<p className="text-xl leading-relaxed text-neutral-300 md:text-2xl">
							Hi, I&apos;m{" "}
							<span className="font-medium text-white">Zeyad Deeb</span>.
						</p>

						<p className="text-lg leading-relaxed text-neutral-400">
							Crafting digital experiences at the intersection of AI, design,
							and technology.
						</p>

						<p className="text-lg leading-relaxed text-neutral-400">
							Based in Brooklyn, NY.
						</p>
					</motion.div>

					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.8, delay: 0.4 }}
						className="mt-12 flex flex-wrap gap-4"
					>
						<a
							href="https://github.com/zeyaddeeb"
							target="_blank"
							rel="noopener noreferrer"
							className="group flex items-center gap-2 rounded-full border border-[#7f9d6f]/35 px-6 py-3 text-sm uppercase tracking-widest text-neutral-300 transition-all hover:border-[#7f9d6f]/70 hover:text-white"
						>
							GitHub
							<svg
								className="h-4 w-4 transition-transform group-hover:translate-x-1"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M17 8l4 4m0 0l-4 4m4-4H3"
								/>
							</svg>
						</a>
						<a
							href="https://linkedin.com/in/zeyaddeeb"
							target="_blank"
							rel="noopener noreferrer"
							className="group flex items-center gap-2 rounded-full border border-[#7f9d6f]/35 px-6 py-3 text-sm uppercase tracking-widest text-neutral-300 transition-all hover:border-[#7f9d6f]/70 hover:text-white"
						>
							LinkedIn
							<svg
								className="h-4 w-4 transition-transform group-hover:translate-x-1"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M17 8l4 4m0 0l-4 4m4-4H3"
								/>
							</svg>
						</a>
					</motion.div>
				</div>
			</section>
		</main>
	);
}
