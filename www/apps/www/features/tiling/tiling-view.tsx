"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/features/live/use-running";
import { drawTiling, glide, useTiling, type Variant } from "./engine";

interface TilingViewProps {
	variant: Variant;
	running: boolean;
	phaseSeed?: number;
	maxTiles?: number;
	minSize?: number;
	rimGlow?: boolean;
	halfRate?: boolean;
	zoomable?: boolean;
	onBuilt?: (id: string, tileCount: number) => void;
	className?: string;
}

export function TilingView({
	variant,
	running,
	phaseSeed = 1,
	maxTiles = 420,
	minSize = 0.0045,
	rimGlow = false,
	halfRate = true,
	zoomable = false,
	onBuilt,
	className = "",
}: TilingViewProps) {
	const reduced = useReducedMotion();
	const animate = running && !reduced;
	const handlesRef = useTiling(variant, maxTiles, minSize, onBuilt);
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const zoomRef = useRef({ cur: 1, target: 1 });
	const clockRef = useRef({ theta: phaseSeed * 1.31, phase: phaseSeed * 2.17 });
	const dirtyRef = useRef(true);
	const dprRef = useRef(1);

	useEffect(() => {
		const wrap = wrapRef.current;
		const canvas = canvasRef.current;
		if (!wrap || !canvas) return;

		const resize = () => {
			const size = Math.min(wrap.clientWidth, wrap.clientHeight);
			if (size <= 0) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			dprRef.current = dpr;
			canvas.width = Math.floor(size * dpr);
			canvas.height = Math.floor(size * dpr);
			canvas.style.width = `${size}px`;
			canvas.style.height = `${size}px`;
			dirtyRef.current = true;
		};

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const zoom = zoomRef.current;
			zoom.target = Math.min(
				6,
				Math.max(1, zoom.target * Math.exp(-e.deltaY * 0.0015)),
			);
		};

		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		if (zoomable) canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			ro.disconnect();
			canvas.removeEventListener("wheel", onWheel);
		};
	}, [zoomable]);

	useEffect(() => {
		let raf = 0;
		let last = performance.now();
		let frame = 0;

		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			frame++;
			if (halfRate && frame % 2 !== 0) return;
			if (!animate && !dirtyRef.current) return;

			const canvas = canvasRef.current;
			const { tiling, layout, colors, theme } = handlesRef.current;
			if (!canvas || !tiling || canvas.width === 0) return;
			if (canvas.clientWidth === 0) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const clock = clockRef.current;
			if (animate) {
				clock.theta += dt * 0.012;
				clock.phase += dt * 0.016;
			}
			const view = glide(clock);
			const verts = tiling.transform_vertices(
				view.ar,
				view.ai,
				view.br,
				view.bi,
			);
			const zoom = zoomRef.current;
			zoom.cur += (zoom.target - zoom.cur) * Math.min(1, dt * 6);
			const dpr = dprRef.current;
			drawTiling(
				ctx,
				canvas.width,
				dpr,
				layout,
				colors,
				theme,
				verts,
				rimGlow,
				now / 1000 + phaseSeed * 1.7,
				zoom.cur,
			);
			dirtyRef.current = false;
		};

		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [handlesRef, animate, halfRate, rimGlow, phaseSeed]);

	return (
		<div ref={wrapRef} className={`grid place-items-center ${className}`}>
			<canvas ref={canvasRef} className="block" aria-label={variant.title} />
		</div>
	);
}
