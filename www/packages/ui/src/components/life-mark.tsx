"use client";

import { useEffect, useRef } from "react";

const N = 8;
const TICK_MS = 4000;
const FADE_MS = 480;
const ALPHA = 0.9;

const GLIDER: [number, number][] = [
	[0, 1],
	[1, 2],
	[2, 0],
	[2, 1],
	[2, 2],
];

function step(cells: Uint8Array) {
	const next = new Uint8Array(N * N);
	for (let r = 0; r < N; r++) {
		for (let c = 0; c < N; c++) {
			let n = 0;
			for (let dr = -1; dr <= 1; dr++)
				for (let dc = -1; dc <= 1; dc++) {
					if (!dr && !dc) continue;
					n += cells[((r + dr + N) % N) * N + ((c + dc + N) % N)];
				}
			const alive = cells[r * N + c] === 1;
			next[r * N + c] = alive ? (n === 2 || n === 3 ? 1 : 0) : n === 3 ? 1 : 0;
		}
	}
	return next;
}

const ease = (t: number) => 1 - (1 - t) ** 3;

export function LifeMark({ size = 20 }: { size?: number }) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = size * dpr;
		canvas.height = size * dpr;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.scale(dpr, dpr);

		let from = new Uint8Array(N * N);
		for (const [r, c] of GLIDER) from[(r + 1) * N + (c + 1)] = 1;
		let to = from;

		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const cell = size / N;
		const ink = getComputedStyle(canvas).color;

		const paint = (t: number) => {
			ctx.clearRect(0, 0, size, size);
			ctx.fillStyle = ink;
			const k = ease(t);
			for (let i = 0; i < from.length; i++) {
				const a = from[i] + (to[i] - from[i]) * k;
				if (a <= 0.01) continue;
				ctx.globalAlpha = a * ALPHA;
				const r = Math.floor(i / N);
				const c = i % N;
				ctx.fillRect(c * cell + 0.5, r * cell + 0.5, cell - 1, cell - 1);
			}
			ctx.globalAlpha = 1;
		};

		paint(1);

		let raf = 0;
		let fadeStart = 0;
		const fade = (now: number) => {
			const t = Math.min((now - fadeStart) / FADE_MS, 1);
			paint(t);
			if (t < 1) raf = requestAnimationFrame(fade);
			else from = to;
		};

		const id = setInterval(() => {
			if (motion.matches || document.visibilityState !== "visible") return;
			from = to;
			to = step(from);
			cancelAnimationFrame(raf);
			fadeStart = performance.now();
			raf = requestAnimationFrame(fade);
		}, TICK_MS);

		return () => {
			clearInterval(id);
			cancelAnimationFrame(raf);
		};
	}, [size]);

	return (
		<canvas
			ref={ref}
			aria-hidden="true"
			tabIndex={-1}
			style={{ width: size, height: size }}
			className="block text-foreground"
		/>
	);
}
