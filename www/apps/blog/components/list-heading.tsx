"use client";

import { motion } from "framer-motion";

interface ListHeadingProps {
	title: string;
	description: string;
}

export function ListHeading({ title, description }: ListHeadingProps) {
	return (
		<section className="blog-list-heading border-b border-rule">
			<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
				>
					<h1
						className="text-2xl font-bold tracking-tight text-ink md:text-3xl"
						style={{ fontFamily: "var(--font-display)" }}
					>
						{title}
					</h1>
					<p className="mt-1 text-sm text-dim md:text-base">{description}</p>
				</motion.div>
			</div>
		</section>
	);
}
