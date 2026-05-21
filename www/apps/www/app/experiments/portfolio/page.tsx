"use client";

import { motion } from "framer-motion";
import { type PointerEvent, useMemo, useState } from "react";

type TileSize = "hero" | "wide" | "tall" | "standard";

type WebsiteCard = {
	title: string;
	domain: string;
	previewTarget: string;
	href: string;
	tag: string;
	year: string;
	size: TileSize;
	accent: string;
	external?: boolean;
};

const websites: WebsiteCard[] = [
	{
		title: "Pulsar Labs",
		domain: "pulsarlabs.io",
		previewTarget: "https://www.pulsarlabs.io",
		href: "https://www.pulsarlabs.io",
		tag: "Client",
		year: "2026",
		size: "hero",
		accent: "#f59e0b",
		external: true,
	},
	{
		title: "Robot Playground",
		domain: "robot.zeyaddeeb.com",
		previewTarget: "https://robot.zeyaddeeb.com",
		href: "https://robot.zeyaddeeb.com",
		tag: "Experiment",
		year: "2025",
		size: "wide",
		accent: "#fb923c",
		external: true,
	},
];

function tileClasses(size: TileSize) {
	if (size === "hero") {
		return "sm:col-span-2 lg:col-span-8 lg:row-span-3";
	}

	if (size === "wide") {
		return "sm:col-span-2 lg:col-span-7 lg:row-span-2";
	}

	if (size === "tall") {
		return "sm:col-span-1 lg:col-span-5 lg:row-span-3";
	}

	return "sm:col-span-1 lg:col-span-4 lg:row-span-2";
}

export default function WebsiteAtlasPage() {
	const initialOffset = { x: -40, y: -150 };
	const [offset, setOffset] = useState(initialOffset);
	const [dragging, setDragging] = useState(false);
	const [anchor, setAnchor] = useState({ x: 0, y: 0, startX: 0, startY: 0 });

	const bounds = useMemo(
		() => ({
			minX: -900,
			maxX: 900,
			minY: -700,
			maxY: 700,
		}),
		[],
	);

	function clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, value));
	}

	function updateOffset(nextX: number, nextY: number) {
		setOffset({
			x: clamp(nextX, bounds.minX, bounds.maxX),
			y: clamp(nextY, bounds.minY, bounds.maxY),
		});
	}

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if ((event.target as HTMLElement).closest("a,button")) {
			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		setDragging(true);
		setAnchor({
			x: event.clientX,
			y: event.clientY,
			startX: offset.x,
			startY: offset.y,
		});
	}

	function onPointerMove(event: PointerEvent<HTMLDivElement>) {
		if (!dragging) {
			return;
		}

		const deltaX = event.clientX - anchor.x;
		const deltaY = event.clientY - anchor.y;
		updateOffset(anchor.startX + deltaX, anchor.startY + deltaY);
	}

	function onPointerEnd() {
		setDragging(false);
	}

	return (
		<main className="relative h-screen overflow-hidden bg-[#121212] text-[#fff8ee]">
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(circle at 10% 8%, rgba(245, 158, 11, 0.08), transparent 44%), radial-gradient(circle at 90% 88%, rgba(251, 146, 60, 0.08), transparent 42%)",
				}}
			/>
			<div
				className="pointer-events-none absolute inset-0 opacity-25"
				style={{
					backgroundImage:
						"linear-gradient(rgba(255, 248, 238, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 248, 238, 0.04) 1px, transparent 1px)",
					backgroundSize: "52px 52px",
				}}
			/>

			<section className="pointer-events-none absolute left-4 top-24 z-20 max-w-2xl rounded-2xl border border-amber-100/20 bg-neutral-950/65 p-5 backdrop-blur-sm md:left-8 md:top-28">
				<motion.header
					className=""
					initial={{ opacity: 0, y: -12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
				>
					<p className="text-[0.65rem] uppercase tracking-[0.26em] text-amber-200/70">
						Experiments / Portfolio
					</p>
					<h1
						className="mt-3 text-4xl uppercase leading-[0.88] tracking-tight md:text-5xl"
						style={{ fontFamily: "var(--font-anton)" }}
					>
						Portfolio
					</h1>
					<p className="mt-3 text-sm text-[#f5ead8]/76 md:text-base">
						Infinite canvas. Drag to navigate.
					</p>
				</motion.header>
			</section>

			<div className="absolute right-4 top-24 z-20 hidden items-center gap-2 sm:flex md:right-8 md:top-28">
				<button
					type="button"
					onClick={() => updateOffset(offset.x - 150, offset.y)}
					className="rounded-full border border-amber-100/20 bg-neutral-950/75 px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-amber-100/90 transition-colors hover:bg-neutral-900"
				>
					Left
				</button>
				<button
					type="button"
					onClick={() => updateOffset(offset.x + 150, offset.y)}
					className="rounded-full border border-amber-100/20 bg-neutral-950/75 px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-amber-100/90 transition-colors hover:bg-neutral-900"
				>
					Right
				</button>
				<button
					type="button"
					onClick={() => updateOffset(initialOffset.x, initialOffset.y)}
					className="rounded-full border border-amber-100/20 bg-neutral-950/75 px-3 py-1 text-[0.65rem] uppercase tracking-[0.2em] text-amber-100/90 transition-colors hover:bg-neutral-900"
				>
					Center
				</button>
			</div>

			<div
				className="relative h-full w-full cursor-grab active:cursor-grabbing"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerEnd}
				onPointerCancel={onPointerEnd}
				onPointerLeave={onPointerEnd}
				style={{ touchAction: "none" }}
			>
				<motion.div
					className="absolute left-1/2 top-[48%] h-[1800px] w-[2600px] md:top-[50%]"
					animate={{
						x: `calc(-50% + ${offset.x}px)`,
						y: `calc(-50% + ${offset.y}px)`,
					}}
					transition={{
						type: "spring",
						damping: 24,
						stiffness: 220,
						mass: 0.35,
					}}
				>
					<div
						className="absolute inset-0 opacity-35"
						style={{
							backgroundImage:
								"linear-gradient(rgba(255, 248, 238, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 248, 238, 0.04) 1px, transparent 1px)",
							backgroundSize: "72px 72px",
						}}
					/>

					<div className="absolute left-1/2 top-1/2 w-[min(92vw,1450px)] -translate-x-1/2 -translate-y-1/2 px-2 sm:px-4">
						<div className="grid grid-cols-1 auto-rows-[180px] gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:auto-rows-[150px]">
							{websites.map((site, index) => (
								<motion.a
									key={site.title}
									href={site.href}
									target={site.external ? "_blank" : undefined}
									rel={site.external ? "noopener noreferrer" : undefined}
									className={`${tileClasses(site.size)} group relative overflow-hidden rounded-2xl border border-amber-100/20 bg-[#0f0f0f] p-2 shadow-[0_14px_50px_rgba(0,0,0,0.42)]`}
									initial={{ opacity: 0, y: 18 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										delay: 0.08 + index * 0.06,
										duration: 0.5,
										ease: [0.22, 1, 0.36, 1],
									}}
									whileHover={{ y: -4 }}
								>
									<div className="mb-2 flex items-center justify-between px-2 py-1 text-[0.58rem] uppercase tracking-[0.18em] text-[#f5ead8]/58">
										<div className="inline-flex items-center gap-2">
											<span
												className="h-2 w-2 rounded-full"
												style={{ backgroundColor: site.accent }}
											/>
											<span>{site.tag}</span>
										</div>
										<span>{site.year}</span>
									</div>

									<div className="relative h-[calc(100%-2rem)] overflow-hidden rounded-xl border border-amber-100/20 bg-neutral-900">
										<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-neutral-900/70 via-transparent to-transparent" />
										<iframe
											src={site.previewTarget}
											title={`${site.title} live preview`}
											loading="lazy"
											className="pointer-events-none h-full w-full origin-top-left scale-[0.72] border-0 transition-transform duration-500 group-hover:scale-[0.735]"
											style={{ width: "138.9%", height: "138.9%" }}
											referrerPolicy="strict-origin-when-cross-origin"
											sandbox="allow-scripts allow-same-origin"
										/>
										<div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/70 to-transparent p-3">
											<h2
												className="text-2xl uppercase leading-[0.92] tracking-tight text-[#fff8ee]"
												style={{ fontFamily: "var(--font-anton)" }}
											>
												{site.title}
											</h2>
											<p className="mt-1 text-[0.63rem] uppercase tracking-[0.2em] text-amber-100/70">
												{site.domain}
											</p>
										</div>
									</div>
								</motion.a>
							))}
						</div>
					</div>
				</motion.div>
			</div>
		</main>
	);
}
