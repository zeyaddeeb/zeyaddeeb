"use client";

import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { useWasm } from "@/lib/hooks/use-wasm";
import {
	type DrawOptions,
	drawLife,
	type LifeBackend,
	LifeEngine,
	type LifePalette,
	type LifeStats,
} from "./engine";

export interface LifeHandle {
	step: () => void;
	randomize: (probability?: number) => void;
	clear: () => void;
	loadPattern: (offsets: readonly (readonly [number, number])[]) => void;
	engine: () => LifeEngine | null;
}

export interface LifeViewProps {
	cols: number;
	rows: number;
	running: boolean;
	tickMs?: number;
	backend?: LifeBackend;
	interactive?: boolean;
	drawMode?: "draw" | "erase";
	showGrid?: boolean;
	trails?: boolean;
	palette?: LifePalette;
	seedProbability?: number;
	maxFps?: number;
	onStats?: (stats: LifeStats & { fps: number }) => void;
	onReady?: (hasWasm: boolean) => void;
	className?: string;
}

export const LifeView = forwardRef<LifeHandle, LifeViewProps>(function LifeView(
	{
		cols,
		rows,
		running,
		tickMs = 80,
		backend = "wasm",
		interactive = false,
		drawMode = "draw",
		showGrid = false,
		trails = true,
		palette,
		seedProbability = 0.18,
		maxFps = 60,
		onStats,
		onReady,
		className = "",
	},
	ref,
) {
	const { wasm, loading } = useWasm();
	const wrapRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const engineRef = useRef<LifeEngine | null>(null);
	const cellSizeRef = useRef(4);
	const dirtyRef = useRef(true);
	const pointerDownRef = useRef(false);

	const optsRef = useRef<
		DrawOptions & { backend: LifeBackend; tickMs: number }
	>({
		cellSize: 4,
		showGrid,
		trails,
		palette,
		backend,
		tickMs,
	});
	optsRef.current = {
		cellSize: cellSizeRef.current,
		showGrid,
		trails,
		palette,
		backend,
		tickMs,
	};

	const paint = useCallback(() => {
		const canvas = canvasRef.current;
		const engine = engineRef.current;
		if (!canvas || !engine) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		drawLife(ctx, engine, {
			...optsRef.current,
			cellSize: cellSizeRef.current,
		});
		dirtyRef.current = false;
	}, []);

	// Build the engine once WASM settles (or fall back to JS when it fails).
	useEffect(() => {
		if (loading) return;
		engineRef.current?.free();
		const engine = new LifeEngine(cols, rows, wasm);
		engine.seed(seedProbability);
		engineRef.current = engine;
		dirtyRef.current = true;
		onReady?.(engine.hasWasm);
		return () => {
			engine.free();
			if (engineRef.current === engine) engineRef.current = null;
		};
	}, [loading, wasm, cols, rows, seedProbability, onReady]);

	// Size canvas to its container.
	useEffect(() => {
		const wrap = wrapRef.current;
		const canvas = canvasRef.current;
		if (!wrap || !canvas) return;
		const resize = () => {
			const w = wrap.clientWidth;
			const h = wrap.clientHeight;
			if (!w || !h) return;
			const cell = Math.max(1, Math.min(w / cols, h / rows));
			cellSizeRef.current = cell;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const cw = Math.round(cols * cell);
			const ch = Math.round(rows * cell);
			canvas.width = Math.round(cw * dpr);
			canvas.height = Math.round(ch * dpr);
			canvas.style.width = `${cw}px`;
			canvas.style.height = `${ch}px`;
			canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
			dirtyRef.current = true;
			paint();
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, [cols, rows, paint]);

	// Main loop.
	useEffect(() => {
		let raf = 0;
		let lastTick = 0;
		let lastPaint = 0;
		let frames = 0;
		let fpsAt = performance.now();
		let fps = 0;
		const paintInterval = 1000 / maxFps;

		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			const engine = engineRef.current;
			if (!engine) return;

			if (running && now - lastTick >= optsRef.current.tickMs) {
				engine.tick(optsRef.current.backend);
				lastTick = now;
				dirtyRef.current = true;
			}

			if (dirtyRef.current && now - lastPaint >= paintInterval) {
				paint();
				lastPaint = now;
				frames++;
			}

			if (now - fpsAt >= 1000) {
				fps = Math.round((frames * 1000) / (now - fpsAt));
				frames = 0;
				fpsAt = now;
				onStats?.({ ...engine.stats(), fps: running ? fps : 0 });
			}
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [running, maxFps, paint, onStats]);

	useImperativeHandle(
		ref,
		() => ({
			step: () => {
				engineRef.current?.tick(optsRef.current.backend);
				dirtyRef.current = true;
			},
			randomize: (p = seedProbability) => {
				engineRef.current?.seed(p);
				dirtyRef.current = true;
			},
			clear: () => {
				engineRef.current?.clear();
				dirtyRef.current = true;
			},
			loadPattern: (offsets) => {
				engineRef.current?.loadPattern(offsets);
				dirtyRef.current = true;
			},
			engine: () => engineRef.current,
		}),
		[seedProbability],
	);

	const cellAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const cell = cellSizeRef.current;
		return {
			col: Math.floor((e.clientX - rect.left) / cell),
			row: Math.floor((e.clientY - rect.top) / cell),
		};
	};

	const stamp = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const at = cellAt(e);
		if (!at) return;
		engineRef.current?.setCell(at.row, at.col, drawMode === "draw");
		dirtyRef.current = true;
	};

	return (
		<div ref={wrapRef} className={`grid place-items-center ${className}`}>
			<canvas
				ref={canvasRef}
				className={`block ${interactive ? "cursor-crosshair touch-none" : ""}`}
				aria-label="Game of Life"
				onPointerDown={
					interactive
						? (e) => {
								pointerDownRef.current = true;
								e.currentTarget.setPointerCapture(e.pointerId);
								stamp(e);
							}
						: undefined
				}
				onPointerMove={
					interactive
						? (e) => {
								if (pointerDownRef.current) stamp(e);
							}
						: undefined
				}
				onPointerUp={
					interactive
						? () => {
								pointerDownRef.current = false;
							}
						: undefined
				}
				onPointerCancel={
					interactive
						? () => {
								pointerDownRef.current = false;
							}
						: undefined
				}
			/>
		</div>
	);
});
