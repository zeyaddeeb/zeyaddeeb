"use client";

import { motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent, WheelEvent } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

type WebsiteCard = {
	title: string;
	domain: string;
	previewTarget: string;
	href: string;
	tag: string;
	year: string;
	accent: string;
	external?: boolean;
};

type CardLayout = {
	x: number;
	y: number;
	width: number;
	height: number;
};

const websites: WebsiteCard[] = [
	{
		title: "Pulsar Labs",
		domain: "pulsarlabs.io",
		previewTarget: "https://www.pulsarlabs.io",
		href: "https://www.pulsarlabs.io",
		tag: "Client",
		year: "2026",
		accent: "#f59e0b",
		external: true,
	},
];

const INTRO_HEIGHT = 220;
const CARD_WIDTH = 560;
const CARD_HEIGHT = 330;
const GAP = 36;

export default function WebsiteAtlasPage() {
	const [viewport, setViewport] = useState({ width: 1440, height: 820 });
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [zoomLevel, setZoomLevel] = useState(1);
	const [dragging, setDragging] = useState(false);
	const dragAnchor = useRef({ x: 0, y: 0, startX: 0, startY: 0 });

	const columns = websites.length <= 2 ? 1 : 2;

	const cardLayouts = useMemo<CardLayout[]>(
		() =>
			websites.map((_, index) => {
				const column = index % columns;
				const row = Math.floor(index / columns);

				return {
					x: column * (CARD_WIDTH + GAP),
					y: INTRO_HEIGHT + GAP + row * (CARD_HEIGHT + GAP),
					width: CARD_WIDTH,
					height: CARD_HEIGHT,
				};
			}),
		[columns],
	);

	const boardSize = useMemo(() => {
		const cardRight = Math.max(
			0,
			...cardLayouts.map((layout) => layout.x + layout.width),
		);
		const cardBottom = Math.max(
			0,
			...cardLayouts.map((layout) => layout.y + layout.height),
		);

		return {
			width: Math.max(cardRight, 720),
			height: Math.max(cardBottom, INTRO_HEIGHT),
		};
	}, [cardLayouts]);

	const introX = (boardSize.width - 720) / 2;
	const fitZoom = Math.min(
		1,
		Math.max(
			0.42,
			Math.min(
				(viewport.width - 80) / boardSize.width,
				(viewport.height - 96) / boardSize.height,
			),
		),
	);
	const zoom = fitZoom * zoomLevel;

	useLayoutEffect(() => {
		function updateViewport() {
			setViewport({
				width: window.innerWidth,
				height: window.innerHeight - 64,
			});
		}

		const prevBodyOverflow = document.body.style.overflow;
		const prevHtmlOverflow = document.documentElement.style.overflow;
		document.body.style.overflow = "hidden";
		document.documentElement.style.overflow = "hidden";
		window.scrollTo(0, 0);
		updateViewport();
		window.addEventListener("resize", updateViewport);

		return () => {
			document.body.style.overflow = prevBodyOverflow;
			document.documentElement.style.overflow = prevHtmlOverflow;
			window.removeEventListener("resize", updateViewport);
		};
	}, []);

	function clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, value));
	}

	function updateZoom(nextZoomLevel: number) {
		setZoomLevel(clamp(nextZoomLevel, 0.55, 1.9));
	}

	function resetCamera() {
		setOffset({ x: 0, y: 0 });
		setZoomLevel(1);
	}

	function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if ((event.target as HTMLElement).closest("a,button")) {
			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		setDragging(true);
		dragAnchor.current = {
			x: event.clientX,
			y: event.clientY,
			startX: offset.x,
			startY: offset.y,
		};
	}

	function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		if (!dragging) {
			return;
		}

		const deltaX = event.clientX - dragAnchor.current.x;
		const deltaY = event.clientY - dragAnchor.current.y;

		setOffset({
			x: dragAnchor.current.startX + deltaX,
			y: dragAnchor.current.startY + deltaY,
		});
	}

	function onPointerEnd() {
		setDragging(false);
	}

	function onWheel(event: WheelEvent<HTMLDivElement>) {
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();
		updateZoom(zoomLevel - event.deltaY * 0.0015);
	}

	return (
		<main className="relative mt-16 h-[calc(100svh-4rem)] overflow-hidden bg-[#080808] text-[#f5eee4]">
			<div
				className="pointer-events-none absolute inset-0 opacity-45"
				style={{
					backgroundImage:
						"linear-gradient(rgba(245,238,228,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(245,238,228,0.055) 1px, transparent 1px)",
					backgroundSize: `${72 * zoom}px ${72 * zoom}px`,
					backgroundPosition: `${offset.x}px ${offset.y}px`,
				}}
			/>
			<div
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"linear-gradient(180deg, rgba(8,8,8,0.18), rgba(8,8,8,0.88) 88%), linear-gradient(120deg, rgba(245,158,11,0.1), transparent 34%, rgba(251,146,60,0.08))",
				}}
			/>

			<div className="absolute right-4 top-4 z-30 flex items-center gap-2 md:right-6">
				<button
					type="button"
					onClick={() => updateZoom(zoomLevel - 0.12)}
					className="rounded-lg border border-[#f5eee4]/18 bg-neutral-950/78 px-3 py-1 text-[0.64rem] uppercase tracking-[0.18em] text-[#f5eee4]/80 backdrop-blur transition-colors hover:bg-neutral-900"
				>
					Out
				</button>
				<button
					type="button"
					onClick={() => updateZoom(zoomLevel + 0.12)}
					className="rounded-lg border border-[#f5eee4]/18 bg-neutral-950/78 px-3 py-1 text-[0.64rem] uppercase tracking-[0.18em] text-[#f5eee4]/80 backdrop-blur transition-colors hover:bg-neutral-900"
				>
					In
				</button>
				<button
					type="button"
					onClick={resetCamera}
					className="rounded-lg border border-[#f5eee4]/18 bg-neutral-950/78 px-3 py-1 text-[0.64rem] uppercase tracking-[0.18em] text-[#f5eee4]/80 backdrop-blur transition-colors hover:bg-neutral-900"
				>
					Reset
				</button>
			</div>

			<div
				className={`relative h-full w-full ${
					dragging ? "cursor-grabbing" : "cursor-grab"
				}`}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerEnd}
				onPointerCancel={onPointerEnd}
				onPointerLeave={onPointerEnd}
				onWheel={onWheel}
				style={{ touchAction: "none" }}
			>
				<motion.div
					className="absolute left-1/2 top-1/2"
					initial={false}
					animate={{
						x: `calc(-50% + ${offset.x}px)`,
						y: `calc(-50% + ${offset.y}px)`,
						scale: zoom,
					}}
					style={{
						width: `${boardSize.width}px`,
						height: `${boardSize.height}px`,
						transformOrigin: "center center",
					}}
					transition={{
						type: "spring",
						damping: 28,
						stiffness: 260,
						mass: 0.32,
					}}
				>
					<motion.section
						className="absolute top-0 rounded-lg border border-[#f5eee4]/16 bg-neutral-950/72 p-6 text-center shadow-[0_18px_70px_rgba(0,0,0,0.42)] backdrop-blur"
						style={{
							left: `${introX}px`,
							width: "720px",
							height: `${INTRO_HEIGHT}px`,
						}}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
					>
						<p className="text-[0.66rem] uppercase tracking-[0.36em] text-amber-100/58">
							Experiments / Portfolio
						</p>
						<h1
							className="mx-auto mt-4 max-w-[12ch] text-6xl uppercase leading-[0.84] tracking-normal text-[#fff8ee]"
							style={{ fontFamily: "var(--font-anton)" }}
						>
							Selected Web Work
						</h1>
						<div className="mx-auto mt-5 flex w-fit items-center gap-4 text-[0.64rem] uppercase tracking-[0.24em] text-[#f5eee4]/50">
							<span>{websites.length} sites</span>
							<span className="h-px w-12 bg-[#f5eee4]/24" />
							<span>Drag canvas</span>
						</div>
					</motion.section>

					{websites.map((site, index) => (
						<PortfolioCard
							key={site.title}
							site={site}
							layout={cardLayouts[index]!}
							index={index}
						/>
					))}
				</motion.div>
			</div>
		</main>
	);
}

function PortfolioCard({
	site,
	layout,
	index,
}: {
	site: WebsiteCard;
	layout: CardLayout;
	index: number;
}) {
	return (
		<motion.a
			href={site.href}
			target={site.external ? "_blank" : undefined}
			rel={site.external ? "noopener noreferrer" : undefined}
			className="group absolute overflow-hidden rounded-lg border border-[#f5eee4]/18 bg-[#101010] p-2 shadow-[0_22px_90px_rgba(0,0,0,0.54)] transition-colors hover:border-[#f5eee4]/32"
			style={{
				left: `${layout.x}px`,
				top: `${layout.y}px`,
				width: `${layout.width}px`,
				height: `${layout.height}px`,
			}}
			initial={{ opacity: 0, y: 18 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				delay: 0.08 + index * 0.05,
				duration: 0.5,
				ease: [0.22, 1, 0.36, 1],
			}}
		>
			<div className="mb-2 flex h-7 items-center justify-between px-2 text-[0.58rem] uppercase tracking-[0.22em] text-[#f5eee4]/55">
				<div className="inline-flex items-center gap-2">
					<span
						className="h-2 w-2 rounded-full"
						style={{ backgroundColor: site.accent }}
					/>
					<span>{site.tag}</span>
				</div>
				<span>{site.year}</span>
			</div>

			<div className="relative h-[calc(100%-2.25rem)] overflow-hidden rounded-md border border-[#f5eee4]/15 bg-neutral-900">
				<div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/34 via-transparent to-black/76" />
				<iframe
					src={site.previewTarget}
					title={`${site.title} live preview`}
					loading="lazy"
					className="pointer-events-none h-full w-full origin-top-left scale-[0.72] border-0 transition-transform duration-500 group-hover:scale-[0.735]"
					style={{ width: "138.9%", height: "138.9%" }}
					referrerPolicy="strict-origin-when-cross-origin"
					sandbox="allow-scripts allow-same-origin"
				/>
				<div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4">
					<h2
						className="text-3xl uppercase leading-[0.9] tracking-normal text-[#fff8ee]"
						style={{ fontFamily: "var(--font-anton)" }}
					>
						{site.title}
					</h2>
					<p className="mt-1 text-[0.62rem] uppercase tracking-[0.22em] text-amber-100/68">
						{site.domain}
					</p>
				</div>
			</div>
		</motion.a>
	);
}
