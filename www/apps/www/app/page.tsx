"use client";

import { motion } from "framer-motion";

export default function HomePage() {
	return (
		<main className="min-h-screen bg-neutral-950 text-white">
			<section className="relative flex min-h-screen items-center justify-center px-6 py-20">
				<div className="absolute inset-0 bg-linear-to-b from-neutral-900/50 to-neutral-950" />
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
					className="relative z-10 max-w-6xl text-center"
				>
					<motion.h1
						className="mb-6 text-[clamp(2.5rem,8vw,6rem)] font-bold uppercase leading-[0.9] tracking-tight"
						style={{ fontFamily: "var(--font-anton)" }}
					>
						Technologist
					</motion.h1>
					<motion.p
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.3, duration: 0.8 }}
						className="mx-auto max-w-2xl text-lg text-neutral-400 md:text-xl"
					>
						Crafting digital experiences at the intersection of AI, design, and
						technology
					</motion.p>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.5, duration: 0.8 }}
						className="mt-8 flex items-center justify-center gap-4 text-sm uppercase tracking-widest text-neutral-500"
					>
						<span>Based in Brooklyn, NY</span>
					</motion.div>
				</motion.div>
			</section>

			<section className="px-6 py-32">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					whileInView={{ opacity: 1, y: 0 }}
					viewport={{ once: true, margin: "-100px" }}
					transition={{ duration: 0.8 }}
					className="mx-auto max-w-4xl text-center"
				>
					<h2
						className="mb-8 text-[clamp(2.5rem,8vw,5rem)] font-bold uppercase leading-[0.9]"
						style={{ fontFamily: "var(--font-anton)" }}
					>
						Let&apos;s Work
						<br />
						Together
					</h2>
					<p className="mb-12 text-lg text-neutral-400">
						Open to exciting projects and collaborations
					</p>
					<motion.a
						href="mailto:hello@zeyaddeeb.com"
						whileHover={{ scale: 1.05 }}
						whileTap={{ scale: 0.95 }}
						className="inline-block rounded-full border border-white px-12 py-4 text-sm uppercase tracking-widest transition-colors hover:bg-white hover:text-neutral-950"
					>
						Get in Touch
					</motion.a>
				</motion.div>
			</section>

			{/* Footer */}
			<footer className="border-t border-neutral-800 px-6 py-8">
				<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-neutral-500 md:flex-row">
					<p>© 2026 Zeyad Deeb. All rights reserved.</p>
					<div className="flex gap-6 uppercase tracking-widest">
						<a
							href="https://github.com/zeyaddeeb"
							className="transition-colors hover:text-white"
						>
							GitHub
						</a>
						<a
							href="https://linkedin.com/in/zeyaddeeb"
							className="transition-colors hover:text-white"
						>
							LinkedIn
						</a>
						<a
							href="https://twitter.com/zeyaddeeb"
							className="transition-colors hover:text-white"
						>
							Twitter
						</a>
					</div>
				</div>
			</footer>
		</main>
	);
}
