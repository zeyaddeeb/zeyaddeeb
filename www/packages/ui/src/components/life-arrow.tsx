"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
	type Direction,
	key,
	PERIOD,
	pick,
	specimen,
	variants,
} from "./life-ships";

const CELL = 5;
const SIZE = 25;
const GEN_MS = 130;

export function LifeArrow({
	direction = "right",
	seed,
	className,
	active,
}: {
	direction?: Direction;
	seed?: string | number;
	className?: string;
	active?: boolean;
}) {
	const ref = useRef<SVGSVGElement>(null);
	const id = useId();
	const [gen, setGen] = useState(0);

	const { frames, rows, cols } = specimen(
		direction,
		pick(seed ?? id, variants(direction)),
	);

	const side = Math.max(SIZE, cols * CELL, rows * CELL);
	const ox = (side - cols * CELL) / 2;
	const oy = (side - rows * CELL) / 2;
	const lag = pick(seed ?? id, PERIOD * 2) * GEN_MS;

	useEffect(() => {
		const svg = ref.current;

		if (!svg) return;

		const host = svg.closest("a, button") ?? svg;
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const hover = window.matchMedia("(hover: hover)");
		let inView = false;
		let hovered = false;
		let focused = host.contains(document.activeElement);
		let timers: number[] = [];

		const clear = () => {
			for (const t of timers) clearTimeout(t);

			timers = [];
		};

		const sail = (repeat: boolean, delay = 0) => {
			clear();

			for (let g = 1; g <= PERIOD; g++) {
				timers.push(
					window.setTimeout(() => setGen(g), delay + (g - 1) * GEN_MS),
				);
			}

			if (repeat) {
				timers.push(
					window.setTimeout(() => setGen(0), delay + PERIOD * GEN_MS),
				);

				timers.push(
					window.setTimeout(() => sail(true), delay + (PERIOD + 4) * GEN_MS),
				);
			}
		};

		const rest = () => {
			clear();
			setGen(0);
		};

		const update = () => {
			const enabled = active ?? (hover.matches ? hovered || focused : inView);

			if (
				enabled &&
				!motion.matches &&
				document.visibilityState === "visible"
			) {
				const idle = active === undefined && !hover.matches;

				sail(active !== undefined || idle, idle ? lag : 0);
			} else {
				rest();
			}
		};

		const enter = () => {
			hovered = true;
			update();
		};

		const leave = () => {
			hovered = false;
			update();
		};

		const focus = () => {
			focused = true;
			update();
		};

		const blur = () => {
			focused = false;
			update();
		};

		const observer =
			active === undefined
				? new IntersectionObserver(([entry]) => {
						inView = entry?.isIntersecting ?? false;

						if (!hover.matches) update();
					})
				: null;

		observer?.observe(svg);

		if (active === undefined) {
			host.addEventListener("pointerenter", enter);
			host.addEventListener("pointerleave", leave);
			host.addEventListener("focusin", focus);
			host.addEventListener("focusout", blur);
		}

		motion.addEventListener("change", update);
		hover.addEventListener("change", update);
		document.addEventListener("visibilitychange", update);
		update();

		return () => {
			clear();
			observer?.disconnect();
			host.removeEventListener("pointerenter", enter);
			host.removeEventListener("pointerleave", leave);
			host.removeEventListener("focusin", focus);
			host.removeEventListener("focusout", blur);
			motion.removeEventListener("change", update);
			hover.removeEventListener("change", update);
			document.removeEventListener("visibilitychange", update);
		};
	}, [active, lag]);

	return (
		<svg
			ref={ref}
			viewBox={`0 0 ${side} ${side}`}
			width="1em"
			height="1em"
			fill="currentColor"
			aria-hidden="true"
			focusable="false"
			className={className}
			style={{
				display: "inline-block",
				verticalAlign: "-0.125em",
				flexShrink: 0,
				overflow: "visible",
			}}
		>
			{frames.map(({ r, c, alive }) => (
				<rect
					key={key(r, c)}
					x={ox + c * CELL + 0.5}
					y={oy + r * CELL + 0.5}
					width={CELL - 1}
					height={CELL - 1}
					style={{
						opacity: alive[gen] ? 1 : 0,
						transition: `opacity ${GEN_MS}ms ease-out`,
					}}
				/>
			))}
		</svg>
	);
}
