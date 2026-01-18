"use client";

import { motion } from "framer-motion";

export function Header() {
	return (
		<header className="fixed left-0 right-0 top-0 z-50 px-6 py-6">
			<nav className="mx-auto flex max-w-7xl items-center justify-between">
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.2, duration: 0.8 }}
					className="text-xl text-white font-bold uppercase tracking-tight"
					style={{ fontFamily: "var(--font-anton)" }}
				>
					Z
				</motion.div>
			</nav>
		</header>
	);
}
