"use client";

import { motion } from "framer-motion";

export default function HomePage() {
	return (
		<main className="bg-neutral-950 text-white">
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
						COMING SOON
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
		</main>
	);
}
