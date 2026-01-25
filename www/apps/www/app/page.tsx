"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

const isDev = process.env.NODE_ENV !== "production";

interface DiagonalSectionProps {
	title: string;
	subtitle: string;
	href: string;
	external?: boolean;
	index: number;
	activeIndex: number | null;
	setActiveIndex: (index: number | null) => void;
}

function DiagonalSection({
	title,
	subtitle,
	href,
	external,
	index,
	activeIndex,
	setActiveIndex,
}: DiagonalSectionProps) {
	const isActive = activeIndex === index;
	const isOtherActive = activeIndex !== null && activeIndex !== index;

	const sectionStyles = [
		{
			gradient: "from-rose-950 via-neutral-950 to-neutral-950",
			accentGradient: "from-rose-500/20 via-transparent to-transparent",
			glowColor: "bg-rose-500/30",
		},
		{
			gradient: "from-indigo-950 via-neutral-950 to-neutral-950",
			accentGradient: "from-violet-500/20 via-transparent to-transparent",
			glowColor: "bg-violet-500/30",
		},
		{
			gradient: "from-emerald-950 via-neutral-950 to-neutral-950",
			accentGradient: "from-emerald-500/20 via-transparent to-transparent",
			glowColor: "bg-emerald-500/30",
		},
	];

	const style = sectionStyles[index];

	const content = (
		<motion.div
			className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-950"
			style={{
				clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)",
			}}
			initial={{ opacity: 0, x: index === 0 ? -100 : index === 2 ? 100 : 0 }}
			animate={{
				opacity: isOtherActive ? 0.3 : 1,
				scale: isActive ? 1.02 : 1,
			}}
			whileInView={{ opacity: 1, x: 0 }}
			viewport={{ once: true }}
			transition={{
				duration: 0.8,
				delay: index * 0.15,
				ease: [0.22, 1, 0.36, 1],
			}}
			onMouseEnter={() => setActiveIndex(index)}
			onMouseLeave={() => setActiveIndex(null)}
		>
			<div className={`absolute inset-0 bg-linear-to-br ${style.gradient}`} />

			<div
				className={`absolute inset-0 bg-linear-to-br ${style.accentGradient}`}
			/>

			<motion.div
				className={`absolute -inset-20 ${style.glowColor} blur-3xl`}
				initial={{ opacity: 0 }}
				animate={{ opacity: isActive ? 0.6 : 0 }}
				transition={{ duration: 0.5 }}
			/>

			<div
				className="pointer-events-none absolute inset-0 opacity-[0.15]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
				}}
			/>

			<div
				className="pointer-events-none absolute inset-0 opacity-[0.03]"
				style={{
					backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
						linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
					backgroundSize: "50px 50px",
				}}
			/>

			<div className="relative z-10 text-center px-6">
				<motion.h2
					className="text-[clamp(2rem,6vw,5rem)] font-bold uppercase leading-[0.9] tracking-tight text-white drop-shadow-2xl"
					style={{ fontFamily: "var(--font-anton)" }}
					animate={{ y: isActive ? -5 : 0 }}
					transition={{ duration: 0.3 }}
				>
					{title}
				</motion.h2>
				<motion.p
					className="mt-4 text-sm uppercase tracking-[0.3em] text-white/60"
					animate={{ opacity: isActive ? 1 : 0.6 }}
					transition={{ duration: 0.3 }}
				>
					{subtitle}
				</motion.p>
			</div>

			<motion.div
				className="absolute bottom-8 left-8 text-white/40 md:bottom-12 md:left-12"
				initial={{ opacity: 0, x: -10 }}
				animate={{ opacity: isActive ? 1 : 0, x: isActive ? 0 : -10 }}
				transition={{ duration: 0.3 }}
			>
				<svg
					className="h-8 w-8"
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
			</motion.div>

			<motion.div
				className={`absolute bottom-0 left-0 right-0 h-0.5 ${style.glowColor}`}
				initial={{ scaleX: 0 }}
				animate={{ scaleX: isActive ? 1 : 0 }}
				transition={{ duration: 0.4 }}
				style={{ transformOrigin: "left" }}
			/>
		</motion.div>
	);

	// Use regular anchor for external links (like blog in dev mode)
	if (external) {
		return (
			<a href={href} className="block h-full w-full">
				{content}
			</a>
		);
	}

	return (
		<Link href={href} className="block h-full w-full">
			{content}
		</Link>
	);
}

export default function HomePage() {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);

	const sections = [
		{
			title: "Blog",
			subtitle: "Thoughts & Writing",
			href: isDev ? "http://localhost:3001/blog" : "/blog",
			external: isDev,
		},
		{
			title: "Experiments",
			subtitle: "Creative Explorations",
			href: "/experiments",
		},
		{
			title: "About",
			subtitle: "Who I Am",
			href: "/about",
		},
	];

	return (
		<main className="bg-neutral-950 text-white">
			<motion.div
				className="pointer-events-none fixed right-8 top-8 z-50 hidden text-right md:block"
				initial={{ opacity: 0, x: 20 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
			>
				<motion.h1
					className="text-4xl font-bold uppercase leading-[0.85] tracking-tight text-white mix-blend-difference lg:text-5xl xl:text-6xl"
					style={{ fontFamily: "var(--font-anton)" }}
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
				>
					Zeyad Deeb
				</motion.h1>
				<motion.p
					className="mt-2 text-xs uppercase tracking-[0.3em] text-white/60 mix-blend-difference"
					initial={{ y: 10, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
				>
					AI · Design · Technology
				</motion.p>
			</motion.div>

			<div className="flex min-h-screen flex-col md:hidden">
				{sections.map((section, index) => (
					<div key={section.title} className="h-[33.333vh]">
						<DiagonalSection
							{...section}
							index={index}
							activeIndex={activeIndex}
							setActiveIndex={setActiveIndex}
						/>
					</div>
				))}
			</div>

			<div className="relative hidden min-h-screen md:block overflow-hidden">
				<div className="absolute inset-0 flex">
					{sections.map((section, index) => (
						<div
							key={section.title}
							className="relative h-full"
							style={{
								width: "40%",
								marginLeft: index === 0 ? "0" : "-5%",
								clipPath:
									index === 0
										? "polygon(0 0, 100% 0, 85% 100%, 0 100%)"
										: index === 1
											? "polygon(15% 0, 100% 0, 85% 100%, 0 100%)"
											: "polygon(15% 0, 100% 0, 100% 100%, 0 100%)",
								zIndex: 3 - index,
							}}
						>
							<DiagonalSection
								{...section}
								index={index}
								activeIndex={activeIndex}
								setActiveIndex={setActiveIndex}
							/>
						</div>
					))}
				</div>
			</div>
		</main>
	);
}
