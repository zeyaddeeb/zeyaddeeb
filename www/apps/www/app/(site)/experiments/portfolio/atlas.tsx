"use client";

import { motion } from "framer-motion";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasTouchToggle } from "@/components/canvas-touch-toggle";
import {
	useCanvasInteraction,
	useCanvasWheel,
} from "@/lib/hooks/use-canvas-interaction";

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
		tag: "Owned",
		year: "2024",
		accent: "#f59e0b",
		external: true,
	},
	{
		title: "Pulvi",
		domain: "pulvi.co",
		previewTarget: "https://www.pulvi.co",
		href: "https://www.pulvi.co",
		tag: "Client",
		year: "2026",
		accent: "#129696",
		external: true,
	},
	{
		title: "Moonspell",
		domain: "moonspell.fm",
		previewTarget: "https://www.moonspell.fm",
		href: "https://www.moonspell.fm",
		tag: "Owned",
		year: "2026",
		accent: "#be0a9a",
		external: true,
	},
];

const INTRO_HEIGHT = 0;
const CARD_WIDTH = 560;
const CARD_HEIGHT = 330;
const GAP = 36;

export function WebsiteAtlas() {
	const viewportRef = useRef<HTMLDivElement>(null);
	const interactionRef = useRef<HTMLDivElement>(null);
	const [viewport, setViewport] = useState({ width: 1440, height: 820 });
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [zoomLevel, setZoomLevel] = useState(1);
	const [dragging, setDragging] = useState(false);
	const dragAnchor = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
	const { touchActive, setTouchActive, canInteract, touchAction } =
		useCanvasInteraction();
	useCanvasWheel(interactionRef, (delta) => {
		setZoomLevel((level) =>
			Math.min(1.9, Math.max(0.55, level - delta * 0.0015)),
		);
	});

	const columns = viewport.width < 700 || websites.length <= 2 ? 1 : 2;

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

	const fitZoom = Math.min(
		1,
		Math.max(
			0.15,
			Math.min(
				(viewport.width - 80) / boardSize.width,
				(viewport.height - 96) / boardSize.height,
			),
		),
	);
	const zoom = fitZoom * zoomLevel;

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const update = () =>
			setViewport({
				width: viewport.clientWidth,
				height: viewport.clientHeight,
			});
		update();
		const observer = new ResizeObserver(update);
		observer.observe(viewport);
		return () => observer.disconnect();
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
		if (
			!canInteract(event) ||
			!event.isPrimary ||
			event.button !== 0 ||
			(event.target as HTMLElement).closest("a,button")
		) {
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
		if (!dragging || !canInteract(event)) {
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

	return (
		<div
			ref={viewportRef}
			className="atlas-viewport relative overflow-hidden bg-charcoal text-paper"
		>
			<div
				className="pointer-events-none absolute inset-0 opacity-60"
				style={{
					backgroundImage:
						"radial-gradient(rgba(243,239,229,0.14) 1px, transparent 1px)",
					backgroundSize: `${36 * zoom}px ${36 * zoom}px`,
					backgroundPosition: `${offset.x}px ${offset.y}px`,
				}}
			/>

			<div className="absolute left-3 right-3 top-3 z-30 flex flex-wrap items-center justify-end gap-1">
				<CanvasTouchToggle active={touchActive} onChange={setTouchActive} />
				{[
					["Out", () => updateZoom(zoomLevel - 0.12)],
					["In", () => updateZoom(zoomLevel + 0.12)],
					["Reset", resetCamera],
				].map(([label, fn]) => (
					<button
						key={label as string}
						type="button"
						onClick={fn as () => void}
						className="border border-rule bg-charcoal px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-paper-2 transition-colors hover:border-rule-strong hover:text-paper"
					>
						{label as string}
					</button>
				))}
			</div>

			<div
				className={`relative h-full w-full ${
					dragging ? "cursor-grabbing" : "cursor-grab"
				}`}
				ref={interactionRef}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerEnd}
				onPointerCancel={onPointerEnd}
				onLostPointerCapture={onPointerEnd}
				onPointerLeave={onPointerEnd}
				style={{ touchAction }}
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
					{websites.map((site, index) => (
						<PortfolioCard
							key={site.title}
							site={site}
							layout={cardLayouts[index]}
							index={index}
						/>
					))}
				</motion.div>
			</div>
		</div>
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
			className="group absolute overflow-hidden border border-rule bg-charcoal-2 p-2 transition-colors hover:border-rule-strong"
			style={{
				left: `${layout.x}px`,
				top: `${layout.y}px`,
				width: `${layout.width}px`,
				height: `${layout.height}px`,
			}}
			initial={false}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				delay: 0.08 + index * 0.05,
				duration: 0.5,
				ease: [0.22, 1, 0.36, 1],
			}}
		>
			<div className="mb-2 flex h-7 items-center justify-between px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
				<div className="inline-flex items-center gap-2">
					<span
						className="h-2 w-2 rounded-full"
						style={{ backgroundColor: site.accent }}
					/>
					<span>{site.tag}</span>
				</div>
				<span>{site.year}</span>
			</div>

			<div className="relative h-[calc(100%-2.25rem)] overflow-hidden border border-rule bg-charcoal">
				<iframe
					src={site.previewTarget}
					title={`${site.title} live preview`}
					loading="lazy"
					className="pointer-events-none h-full w-full origin-top-left scale-[0.72] border-0 transition-transform duration-500 "
					style={{ width: "138.9%", height: "138.9%" }}
					referrerPolicy="strict-origin-when-cross-origin"
					sandbox="allow-scripts allow-same-origin"
				/>
				<div className="paper pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-baseline justify-between gap-3 px-3 py-2">
					<h3 className="font-display text-base font-medium tracking-tight">
						{site.title}
					</h3>
					<p className="font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
						{site.domain}
					</p>
				</div>
			</div>
		</motion.a>
	);
}
