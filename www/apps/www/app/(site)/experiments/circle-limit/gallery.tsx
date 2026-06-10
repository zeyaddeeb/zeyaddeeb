"use client";

import type { HyperbolicTiling } from "@zeyaddeeb/wasm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWasm } from "@/lib/hooks/use-wasm";

interface Theme {
	disk: string;
	rim: string;
	stroke: string;
	background: (layer: number, parity: number) => string;
	motif: (layer: number, parity: number) => string;
}

const THEMES = {
	heavenHell: {
		disk: "#0e0c0a",
		rim: "#c9a227",
		stroke: "rgba(201, 162, 39, 0.3)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#f2ecdd" : "#12100d",
		motif: (_layer: number, parity: number) =>
			parity === 0 ? "#12100d" : "#f2ecdd",
	},
	coral: {
		disk: "#081826",
		rim: "#38bdf8",
		stroke: "rgba(226, 232, 240, 0.12)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#0a2138" : "#081826",
		motif: (layer: number, parity: number) => {
			const dim = ["#0f766e", "#b45309", "#b91c1c", "#0369a1"];
			const lit = ["#2dd4bf", "#fbbf24", "#f87171", "#38bdf8"];
			return (parity === 0 ? lit : dim)[layer % 4];
		},
	},
	twilight: {
		disk: "#0a0614",
		rim: "#a78bfa",
		stroke: "rgba(233, 213, 255, 0.1)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#140a26" : "#0a0614",
		motif: (layer: number, parity: number) => {
			const hue = 292 - Math.min(layer, 16) * 8;
			return `hsl(${hue}, 72%, ${parity === 0 ? 64 : 44}%)`;
		},
	},
	woodcut: {
		disk: "#e9e1ca",
		rim: "#211c17",
		stroke: "rgba(33, 28, 23, 0.45)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#e9e1ca" : "#dbd0b0",
		motif: (_layer: number, parity: number) =>
			parity === 0 ? "#26201a" : "#41342a",
	},
	ember: {
		disk: "#0e0a08",
		rim: "#f59e0b",
		stroke: "rgba(0, 0, 0, 0.35)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#1a1109" : "#0e0a08",
		motif: (layer: number, parity: number) => {
			const hue = Math.max(6, 48 - layer * 4);
			return `hsl(${hue}, 92%, ${parity === 0 ? 58 : 40}%)`;
		},
	},
	ink: {
		disk: "#050505",
		rim: "#d4d4d4",
		stroke: "rgba(255, 255, 255, 0.08)",
		background: (_layer: number, parity: number) =>
			parity === 0 ? "#101010" : "#050505",
		motif: (layer: number, parity: number) =>
			`hsl(0, 0%, ${parity === 0 ? 92 : Math.max(38, 68 - layer * 3)}%)`,
	},
} satisfies Record<string, Theme>;

export interface Variant {
	id: string;
	plate: string;
	title: string;
	p: number;
	q: number;
	theme: keyof typeof THEMES;
	blurb: string;
}

const VARIANTS: Variant[] = [
	{
		id: "heaven",
		plate: "I",
		title: "Heaven & Hell",
		p: 7,
		q: 3,
		theme: "heavenHell",
		blurb:
			"Light and dark trade places with every mirror. Three heptagons meet at each corner — impossible on flat paper.",
	},
	{
		id: "reef",
		plate: "II",
		title: "Coral Reef",
		p: 3,
		q: 7,
		theme: "coral",
		blurb:
			"Seven-fold whirlpools in a midnight sea, after the four-color currents of Circle Limit III.",
	},
	{
		id: "twilight",
		plate: "III",
		title: "Twilight",
		p: 5,
		q: 4,
		theme: "twilight",
		blurb:
			"Order-four pentagons, violet vortices dimming layer by layer toward the circle at infinity.",
	},
	{
		id: "woodcut",
		plate: "IV",
		title: "Woodcut",
		p: 6,
		q: 4,
		theme: "woodcut",
		blurb:
			"Charcoal on paper — the figure Coxeter mailed to Escher, carved entirely by reflection.",
	},
	{
		id: "ember",
		plate: "V",
		title: "Ember",
		p: 8,
		q: 3,
		theme: "ember",
		blurb:
			"Octagonal fire, each ring of tiles a cooler shade, burning down to an infinitely distant rim.",
	},
	{
		id: "ink",
		plate: "VI",
		title: "Ink",
		p: 4,
		q: 5,
		theme: "ink",
		blurb:
			"Five squares at every corner, white ink on black — geometry with nowhere left to hide.",
	},
];

interface Mobius {
	ar: number;
	ai: number;
	br: number;
	bi: number;
}

const identity = (): Mobius => ({ ar: 1, ai: 0, br: 0, bi: 0 });

function normalize(m: Mobius): Mobius {
	const n2 = m.ar * m.ar + m.ai * m.ai - m.br * m.br - m.bi * m.bi;
	if (n2 < 1e-9) return identity();
	const n = Math.sqrt(n2);
	return { ar: m.ar / n, ai: m.ai / n, br: m.br / n, bi: m.bi / n };
}

function compose(m1: Mobius, m2: Mobius): Mobius {
	return normalize({
		ar: m1.ar * m2.ar - m1.ai * m2.ai + m1.br * m2.br + m1.bi * m2.bi,
		ai: m1.ar * m2.ai + m1.ai * m2.ar + m1.bi * m2.br - m1.br * m2.bi,
		br: m1.ar * m2.br - m1.ai * m2.bi + m1.br * m2.ar + m1.bi * m2.ai,
		bi: m1.ar * m2.bi + m1.ai * m2.br + m1.bi * m2.ar - m1.br * m2.ai,
	});
}

function translation(tr: number, ti: number): Mobius {
	return normalize({ ar: 1, ai: 0, br: tr, bi: ti });
}

function rotation(theta: number): Mobius {
	return { ar: Math.cos(theta / 2), ai: Math.sin(theta / 2), br: 0, bi: 0 };
}

interface TileColors {
	background: string[];
	motif: string[];
}

function buildColors(meta: Uint32Array, theme: Theme): TileColors {
	const n = meta.length / 2;
	const background = new Array<string>(n);
	const motif = new Array<string>(n);
	for (let i = 0; i < n; i++) {
		background[i] = theme.background(meta[i * 2], meta[i * 2 + 1]);
		motif[i] = theme.motif(meta[i * 2], meta[i * 2 + 1]);
	}
	return { background, motif };
}

const GLIDE_AMPLITUDE = 0.13;

interface Layout {
	stride: number;
	boundary: number;
	bladePts: number;
	sides: number;
	count: number;
}

function glide(clock: { theta: number; phase: number }): Mobius {
	return compose(
		rotation(clock.theta),
		translation(
			GLIDE_AMPLITUDE * Math.cos(clock.phase),
			GLIDE_AMPLITUDE * Math.sin(clock.phase * 0.73 + 1.4),
		),
	);
}

function drawTiling(
	ctx: CanvasRenderingContext2D,
	size: number,
	weight: number,
	layout: Layout,
	colors: TileColors,
	theme: Theme,
	verts: Float64Array,
	rimGlow: boolean,
	time = 0,
	zoom = 1,
) {
	const c = size / 2;
	const radius = c - 6 * weight;
	const rz = radius * zoom;

	ctx.clearRect(0, 0, size, size);

	ctx.save();
	ctx.beginPath();
	ctx.arc(c, c, radius, 0, Math.PI * 2);
	ctx.clip();
	ctx.fillStyle = theme.disk;
	ctx.fillRect(0, 0, size, size);

	const { stride, boundary, bladePts, sides, count } = layout;
	const half = (boundary >> 1) * 2;
	ctx.strokeStyle = theme.stroke;
	ctx.lineWidth = Math.max(0.5, 0.6 * weight);
	const cull = 1.4 * weight;
	const motifCull = 7 * weight;

	for (let ti = 0; ti < count; ti++) {
		const o = ti * stride * 2;
		const x0 = c + verts[o] * rz;
		const y0 = c - verts[o + 1] * rz;
		const xm = c + verts[o + half] * rz;
		const ym = c - verts[o + half + 1] * rz;
		const extent = Math.abs(x0 - xm) + Math.abs(y0 - ym);
		if (extent < cull) continue;

		ctx.beginPath();
		ctx.moveTo(x0, y0);
		for (let j = 1; j < boundary; j++) {
			ctx.lineTo(c + verts[o + j * 2] * rz, c - verts[o + j * 2 + 1] * rz);
		}
		ctx.closePath();
		ctx.fillStyle = colors.background[ti];
		ctx.fill();
		ctx.stroke();

		if (extent < motifCull) continue;

		ctx.fillStyle = colors.motif[ti];
		for (let b = 0; b < sides; b++) {
			const bo = o + (boundary + b * bladePts) * 2;
			ctx.beginPath();
			ctx.moveTo(c + verts[bo] * rz, c - verts[bo + 1] * rz);
			for (let j = 1; j < bladePts; j++) {
				ctx.lineTo(c + verts[bo + j * 2] * rz, c - verts[bo + j * 2 + 1] * rz);
			}
			ctx.closePath();
			ctx.fill();
		}
	}

	const vignette = ctx.createRadialGradient(c, c, radius * 0.55, c, c, radius);
	vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
	vignette.addColorStop(1, "rgba(0, 0, 0, 0.45)");
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, size, size);
	ctx.restore();

	if (rimGlow) {
		const pulse = 0.5 + 0.5 * Math.sin(time * 1.7);
		ctx.save();
		ctx.beginPath();
		ctx.arc(c, c, radius, 0, Math.PI * 2);
		ctx.strokeStyle = theme.rim;
		ctx.lineWidth = 1.2 * weight;
		ctx.shadowColor = theme.rim;
		ctx.shadowBlur = (11 + pulse * 11) * weight;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(c, c, radius - 3.2 * weight, 0, Math.PI * 2);
		ctx.globalAlpha = 0.15 + pulse * 0.25;
		ctx.shadowBlur = 0;
		ctx.lineWidth = 0.6 * weight;
		ctx.stroke();
		ctx.restore();
	}
}

interface TilingHandles {
	tiling: HyperbolicTiling | null;
	layout: Layout;
	colors: TileColors;
	theme: Theme;
}

function useTiling(
	variant: Variant,
	maxTiles: number,
	minSize: number,
	onBuilt?: (id: string, tileCount: number) => void,
) {
	const { wasm } = useWasm();
	const handlesRef = useRef<TilingHandles>({
		tiling: null,
		layout: { stride: 0, boundary: 0, bladePts: 0, sides: 0, count: 0 },
		colors: { background: [], motif: [] },
		theme: THEMES[variant.theme],
	});

	useEffect(() => {
		if (!wasm) return;

		try {
			const tiling = wasm.HyperbolicTiling.new(
				variant.p,
				variant.q,
				maxTiles,
				minSize,
			);
			handlesRef.current.tiling?.free?.();
			handlesRef.current = {
				tiling,
				layout: {
					stride: tiling.points_per_tile(),
					boundary: tiling.boundary_points_per_tile(),
					bladePts: tiling.points_per_blade(),
					sides: tiling.polygon_sides(),
					count: tiling.tile_count(),
				},
				colors: buildColors(tiling.get_meta(), THEMES[variant.theme]),
				theme: THEMES[variant.theme],
			};
			onBuilt?.(variant.id, tiling.tile_count());
		} catch (err) {
			console.error("Failed to build hyperbolic tiling:", err);
		}
	}, [wasm, variant, maxTiles, minSize, onBuilt]);

	useEffect(() => {
		return () => {
			handlesRef.current.tiling?.free?.();
			handlesRef.current.tiling = null;
		};
	}, []);

	return handlesRef;
}

function StellatedStar({
	variant,
	onBuilt,
}: {
	variant: Variant;
	onBuilt?: (id: string, tileCount: number) => void;
}) {
	const handlesRef = useTiling(variant, 1800, 0.0015, onBuilt);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const artCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const clockRef = useRef({ theta: 0, phase: 0 });
	const driftRef = useRef({ angle: 0, velocity: 0 });
	const parallaxRef = useRef({ x: 0, y: 0 });
	const zoomRef = useRef({ cur: 1, target: 1 });
	const dragRef = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		const wrapper = wrapperRef.current;
		const canvas = canvasRef.current;
		if (!wrapper || !canvas) return;

		const resize = () => {
			const w = wrapper.clientWidth;
			const h = wrapper.clientHeight;
			if (w === 0 || h === 0) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.floor(w * dpr);
			canvas.height = Math.floor(h * dpr);
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(wrapper);

		const el = canvas;
		const pointers = new Map<number, { x: number; y: number }>();
		let pinchDist = 0;
		const onDown = (e: PointerEvent) => {
			el.setPointerCapture(e.pointerId);
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pointers.size === 2) {
				const [p1, p2] = [...pointers.values()];
				pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
				dragRef.current = null;
			} else {
				dragRef.current = { x: e.clientX, y: e.clientY };
			}
		};
		const onMove = (e: PointerEvent) => {
			const rect = el.getBoundingClientRect();
			parallaxRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			parallaxRef.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
			if (pointers.has(e.pointerId)) {
				pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			}
			if (pointers.size === 2) {
				const [p1, p2] = [...pointers.values()];
				const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
				if (pinchDist > 0 && d > 0) {
					const zoom = zoomRef.current;
					zoom.target = Math.min(
						2.7,
						Math.max(0.82, zoom.target * (d / pinchDist)),
					);
				}
				pinchDist = d;
				return;
			}
			const drag = dragRef.current;
			if (!drag) return;
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			driftRef.current.angle += dx * 0.004 + dy * 0.0015;
			driftRef.current.velocity = dx * 0.018;
			dragRef.current = { x: e.clientX, y: e.clientY };
		};
		const onUp = (e: PointerEvent) => {
			pointers.delete(e.pointerId);
			if (pointers.size < 2) pinchDist = 0;
			dragRef.current = null;
		};
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const zoom = zoomRef.current;
			zoom.target = Math.min(
				2.7,
				Math.max(0.82, zoom.target * Math.exp(-e.deltaY * 0.0012)),
			);
		};
		const onDouble = () => {
			driftRef.current = { angle: 0, velocity: 0 };
			zoomRef.current.target = 1;
		};
		el.addEventListener("pointerdown", onDown);
		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerup", onUp);
		el.addEventListener("pointercancel", onUp);
		el.addEventListener("wheel", onWheel, { passive: false });
		el.addEventListener("dblclick", onDouble);

		let raf = 0;
		let lastTime = performance.now();
		let elapsed = 0;
		const ART_SIZE = 1400;
		const artCanvas = document.createElement("canvas");
		artCanvas.width = ART_SIZE;
		artCanvas.height = ART_SIZE;
		artCanvasRef.current = artCanvas;
		const artCtx = artCanvas.getContext("2d");

		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - lastTime) / 1000);
			lastTime = now;
			elapsed += dt;

			const { tiling, layout, colors, theme } = handlesRef.current;
			const ctx = canvas.getContext("2d");
			if (!ctx || canvas.width === 0) return;

			const dpr = canvas.width / Math.max(1, canvas.clientWidth);
			const width = canvas.width;
			const height = canvas.height;
			ctx.clearRect(0, 0, width, height);

			if (tiling && artCtx) {
				const clock = clockRef.current;
				const drift = driftRef.current;
				if (!dragRef.current) {
					drift.angle += (0.055 + drift.velocity) * dt;
					drift.velocity *= Math.exp(-2.4 * dt);
				}
				clock.theta += dt * 0.13;
				clock.phase += dt * 0.19;
				const view = glide(clock);
				const verts = tiling.transform_vertices(
					view.ar,
					view.ai,
					view.br,
					view.bi,
				);
				const zoom = zoomRef.current;
				zoom.cur += (zoom.target - zoom.cur) * Math.min(1, dt * 6);
				drawTiling(
					artCtx,
					ART_SIZE,
					1.65,
					layout,
					colors,
					theme,
					verts,
					false,
					elapsed,
					zoom.cur,
				);

				const side = Math.min(width, height) * 0.92;
				const cx =
					width / 2 + parallaxRef.current.x * Math.min(28 * dpr, side * 0.035);
				const cy =
					height / 2 -
					18 * dpr -
					parallaxRef.current.y * Math.min(22 * dpr, side * 0.03);
				const r = side / 2;

				ctx.save();
				ctx.translate(cx, cy + r * 0.84);
				ctx.scale(1, 0.12);
				const shadow = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
				shadow.addColorStop(0, "rgba(0, 0, 0, 0.42)");
				shadow.addColorStop(0.55, "rgba(0, 0, 0, 0.18)");
				shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
				ctx.fillStyle = shadow;
				ctx.beginPath();
				ctx.arc(0, 0, r, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();

				ctx.save();
				ctx.beginPath();
				ctx.arc(cx, cy, r, 0, Math.PI * 2);
				ctx.clip();
				ctx.translate(cx, cy);
				ctx.rotate(drift.angle);
				ctx.drawImage(artCanvas, -r, -r, r * 2, r * 2);
				ctx.restore();

				ctx.save();
				ctx.beginPath();
				ctx.arc(cx, cy, r, 0, Math.PI * 2);
				ctx.clip();

				const shade = ctx.createRadialGradient(
					cx - r * 0.34,
					cy - r * 0.42,
					r * 0.06,
					cx,
					cy,
					r,
				);
				shade.addColorStop(0, "rgba(255, 255, 235, 0.18)");
				shade.addColorStop(0.28, "rgba(255, 255, 255, 0.03)");
				shade.addColorStop(0.72, "rgba(0, 0, 0, 0.05)");
				shade.addColorStop(1, "rgba(0, 0, 0, 0.5)");
				ctx.fillStyle = shade;
				ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

				const glint = ctx.createLinearGradient(
					cx - r * 0.74,
					cy - r * 0.84,
					cx + r * 0.22,
					cy + r * 0.26,
				);
				glint.addColorStop(0, "rgba(255, 255, 255, 0)");
				glint.addColorStop(0.46, "rgba(255, 255, 255, 0.13)");
				glint.addColorStop(0.54, "rgba(255, 247, 210, 0.04)");
				glint.addColorStop(1, "rgba(255, 255, 255, 0)");
				ctx.globalCompositeOperation = "screen";
				ctx.fillStyle = glint;
				ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
				ctx.restore();

				ctx.save();
				ctx.beginPath();
				ctx.arc(cx, cy, r - 1.5 * dpr, 0, Math.PI * 2);
				ctx.strokeStyle = theme.rim;
				ctx.globalAlpha = 0.52 + 0.16 * Math.sin(elapsed * 0.7);
				ctx.lineWidth = 1.4 * dpr;
				ctx.shadowColor = theme.rim;
				ctx.shadowBlur = 8 * dpr;
				ctx.stroke();
				ctx.beginPath();
				ctx.arc(cx, cy, r - 8 * dpr, 0, Math.PI * 2);
				ctx.globalAlpha = 0.18;
				ctx.lineWidth = 0.65 * dpr;
				ctx.shadowBlur = 0;
				ctx.stroke();
				ctx.restore();
			}
		};
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			observer.disconnect();
			el.removeEventListener("pointerdown", onDown);
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerup", onUp);
			el.removeEventListener("pointercancel", onUp);
			el.removeEventListener("wheel", onWheel);
			el.removeEventListener("dblclick", onDouble);
			artCanvasRef.current = null;
		};
	}, [handlesRef]);

	return (
		<div ref={wrapperRef} className="absolute inset-0">
			<canvas
				ref={canvasRef}
				className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
			/>
		</div>
	);
}

function HyperbolicPlate({
	variant,
	phaseSeed,
	onBuilt,
}: {
	variant: Variant;
	phaseSeed: number;
	onBuilt?: (id: string, tileCount: number) => void;
}) {
	const handlesRef = useTiling(variant, 420, 0.0045, onBuilt);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const zoomRef = useRef({ cur: 1, target: 1 });
	const clockRef = useRef({
		theta: phaseSeed * 1.31,
		phase: phaseSeed * 2.17,
	});

	useEffect(() => {
		const wrapper = wrapperRef.current;
		const canvas = canvasRef.current;
		if (!wrapper || !canvas) return;

		const resize = () => {
			const size = Math.min(wrapper.clientWidth || 400, 400);
			if (size <= 0) return;
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.floor(size * dpr);
			canvas.height = Math.floor(size * dpr);
			canvas.style.width = `${size}px`;
			canvas.style.height = `${size}px`;
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
		const observer = new ResizeObserver(resize);
		observer.observe(wrapper);
		canvas.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			observer.disconnect();
			canvas.removeEventListener("wheel", onWheel);
		};
	}, []);

	useEffect(() => {
		let raf = 0;
		let lastTime = performance.now();
		let frame = 0;

		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - lastTime) / 1000);
			lastTime = now;

			frame++;
			if (frame % 2 !== 0) return;

			const canvas = canvasRef.current;
			const { tiling, layout, colors, theme } = handlesRef.current;
			if (!canvas || !tiling || canvas.width === 0) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const clock = clockRef.current;
			clock.theta += dt * 0.09;
			clock.phase += dt * 0.12;
			const view = glide(clock);
			const verts = tiling.transform_vertices(
				view.ar,
				view.ai,
				view.br,
				view.bi,
			);
			const zoom = zoomRef.current;
			zoom.cur += (zoom.target - zoom.cur) * Math.min(1, dt * 6);
			const dpr = window.devicePixelRatio || 1;
			drawTiling(
				ctx,
				canvas.width,
				dpr,
				layout,
				colors,
				theme,
				verts,
				true,
				now / 1000 + phaseSeed * 1.7,
				zoom.cur,
			);
		};

		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [handlesRef, phaseSeed]);

	return (
		<div ref={wrapperRef} className="w-full">
			<canvas ref={canvasRef} className="block w-full" />
		</div>
	);
}

export default function CircleLimitGallery() {
	const { wasm, loading: wasmLoading } = useWasm();
	const [heroId, setHeroId] = useState("heaven");
	const [tileCounts, setTileCounts] = useState<Record<string, number>>({});
	const heroSectionRef = useRef<HTMLDivElement>(null);

	const handleBuilt = useCallback((id: string, count: number) => {
		setTileCounts((prev) =>
			prev[id] && prev[id] >= count ? prev : { ...prev, [id]: count },
		);
	}, []);

	const hero = VARIANTS.find((v) => v.id === heroId) ?? VARIANTS[0];

	const hangPlate = useCallback((id: string) => {
		setHeroId(id);
		heroSectionRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	}, []);

	if (wasmLoading) {
		return (
			<div className="flex h-96 items-center justify-center">
				<span className="animate-pulse font-mono text-sm text-neutral-500">
					Carving the hyperbolic plane...
				</span>
			</div>
		);
	}

	if (!wasm) {
		return (
			<div className="flex h-96 items-center justify-center">
				<span className="font-mono text-sm text-red-400">
					Failed to load the WebAssembly module.
				</span>
			</div>
		);
	}

	return (
		<div>
			<figure ref={heroSectionRef}>
				<div className="relative mx-auto max-w-4xl">
					<div
						aria-hidden
						className="pointer-events-none absolute -inset-10 animate-pulse rounded-[3rem] blur-[100px]"
						style={{
							background: `radial-gradient(ellipse at 50% 45%, ${THEMES[hero.theme].rim}26 0%, transparent 70%)`,
							animationDuration: "7s",
						}}
					/>
					<div className="relative h-[460px] md:h-[640px]">
						<StellatedStar
							key={`hero-${hero.id}`}
							variant={hero}
							onBuilt={handleBuilt}
						/>
					</div>
				</div>

				<figcaption className="mx-auto mt-6 max-w-lg text-center">
					<div className="font-mono text-[10px] uppercase tracking-[0.35em] text-neutral-500">
						Plate {hero.plate} &middot; {`{${hero.p},${hero.q}}`} &middot; on
						view
					</div>
					<div className="mt-2 font-serif text-2xl italic text-neutral-100">
						{hero.title}
					</div>
					<p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-neutral-600">
						{tileCounts[hero.id]
							? `${tileCounts[hero.id].toLocaleString()} reflected tiles · `
							: ""}
						drag to rotate &middot; scroll to zoom &middot; double-click to
						recenter
					</p>
				</figcaption>
			</figure>

			<div className="mt-28">
				<div className="mb-3 flex items-center gap-6">
					<div className="h-px flex-1 bg-neutral-800" />
					<span className="font-mono text-xs uppercase tracking-[0.35em] text-neutral-500">
						The Plates
					</span>
					<div className="h-px flex-1 bg-neutral-800" />
				</div>
				<p className="mb-12 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-600">
					Click a plate to stage it &middot; scroll over a plate to magnify
				</p>

				<div className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
					{VARIANTS.map((variant, index) => {
						const onView = variant.id === heroId;
						return (
							<button
								key={variant.id}
								type="button"
								onClick={() => hangPlate(variant.id)}
								className="group text-left"
							>
								<div className="relative">
									<div
										aria-hidden
										className="pointer-events-none absolute -inset-5 animate-pulse rounded-full blur-2xl transition-opacity duration-700"
										style={{
											background: `radial-gradient(circle, ${THEMES[variant.theme].rim}4d 0%, transparent 70%)`,
											animationDuration: "5.5s",
											animationDelay: `${index * 0.9}s`,
										}}
									/>
									<div
										className={`relative rounded-full p-[2px] transition-all duration-500 ${
											onView
												? "bg-linear-to-br from-amber-600/80 via-neutral-800 to-amber-600/80"
												: "bg-linear-to-br from-neutral-800 via-neutral-900 to-neutral-800 group-hover:from-neutral-600 group-hover:to-neutral-700"
										}`}
									>
										<div className="overflow-hidden rounded-full bg-neutral-950 p-0.5">
											<HyperbolicPlate
												variant={variant}
												phaseSeed={index + 1}
												onBuilt={handleBuilt}
											/>
										</div>
									</div>
								</div>

								<div className="mt-5 border-t border-neutral-800/80 pt-3">
									<div className="flex items-baseline justify-between">
										<span className="font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">
											Plate {variant.plate} &middot;{" "}
											{`{${variant.p},${variant.q}}`}
										</span>
										{onView && (
											<span className="font-mono text-[9px] uppercase tracking-widest text-amber-500/80">
												On view
											</span>
										)}
									</div>
									<div className="mt-1.5 font-serif text-lg italic text-neutral-200 transition-colors group-hover:text-white">
										{variant.title}
									</div>
									<p className="mt-1 text-xs leading-relaxed text-neutral-500">
										{variant.blurb}
									</p>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
