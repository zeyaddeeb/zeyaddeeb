"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasTouchToggle } from "@/components/canvas-touch-toggle";
import {
	drawTiling,
	glide,
	useTiling,
	VARIANTS,
	type Variant,
} from "@/features/tiling/engine";
import { TilingView } from "@/features/tiling/tiling-view";
import {
	useCanvasInteraction,
	useCanvasWheel,
} from "@/lib/hooks/use-canvas-interaction";
import { useWasm } from "@/lib/hooks/use-wasm";

function StagedPlate({
	variant,
	onBuilt,
}: {
	variant: Variant;
	onBuilt?: (id: string, tileCount: number) => void;
}) {
	const handlesRef = useTiling(variant, 1800, 0.0015, onBuilt);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const clockRef = useRef({ theta: 0, phase: 0 });
	const driftRef = useRef({ angle: 0, velocity: 0 });
	const zoomRef = useRef({ cur: 1, target: 1 });
	const dragRef = useRef<{ x: number; y: number } | null>(null);
	const { touchActive, setTouchActive, canInteract, touchAction } =
		useCanvasInteraction();
	useCanvasWheel(canvasRef, (delta) => {
		zoomRef.current.target = Math.min(
			2.7,
			Math.max(0.82, zoomRef.current.target * Math.exp(-delta * 0.0012)),
		);
	});

	useEffect(() => {
		const wrapper = wrapperRef.current;
		const canvas = canvasRef.current;
		if (!wrapper || !canvas) return;

		let pixelRatio = 1;

		const resize = () => {
			const w = wrapper.clientWidth;
			const h = wrapper.clientHeight;
			if (w === 0 || h === 0) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			pixelRatio = dpr;
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
			if (!canInteract(e) || e.button !== 0) return;
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
			if (!pointers.has(e.pointerId)) return;
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pointers.size === 2) {
				const [p1, p2] = [...pointers.values()];
				const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
				if (pinchDist > 0 && d > 0) {
					zoomRef.current.target = Math.min(
						2.7,
						Math.max(0.82, zoomRef.current.target * (d / pinchDist)),
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
			if (!pointers.has(e.pointerId)) return;
			pointers.delete(e.pointerId);
			if (pointers.size < 2) pinchDist = 0;
			dragRef.current = null;
		};
		const onDouble = () => {
			driftRef.current = { angle: 0, velocity: 0 };
			zoomRef.current.target = 1;
		};
		el.addEventListener("pointerdown", onDown);
		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerup", onUp);
		el.addEventListener("pointercancel", onUp);
		el.addEventListener("lostpointercapture", onUp);
		el.addEventListener("dblclick", onDouble);

		let raf = 0;
		let lastTime = performance.now();
		const ART_SIZE = 1400;
		const art = document.createElement("canvas");
		art.width = ART_SIZE;
		art.height = ART_SIZE;
		const artCtx = art.getContext("2d");

		const loop = (now: number) => {
			raf = requestAnimationFrame(loop);
			const dt = Math.min(0.1, (now - lastTime) / 1000);
			lastTime = now;

			const { tiling, layout, colors, theme } = handlesRef.current;
			const ctx = canvas.getContext("2d");
			if (!ctx || canvas.width === 0 || !tiling || !artCtx) return;
			if (canvas.clientWidth === 0) return;

			const width = canvas.width;
			const height = canvas.height;
			ctx.clearRect(0, 0, width, height);

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
				0,
				zoom.cur,
			);

			const side = Math.min(width, height) * 0.94;
			const cx = width / 2;
			const cy = height / 2;
			const r = side / 2;

			ctx.save();
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.clip();
			ctx.translate(cx, cy);
			ctx.rotate(drift.angle);
			ctx.drawImage(art, -r, -r, r * 2, r * 2);
			ctx.restore();

			const dpr = pixelRatio;
			ctx.save();
			ctx.beginPath();
			ctx.arc(cx, cy, Math.max(0, r - dpr), 0, Math.PI * 2);
			ctx.strokeStyle = theme.rim;
			ctx.lineWidth = 1.2 * dpr;
			ctx.stroke();
			ctx.restore();
		};
		raf = requestAnimationFrame(loop);

		return () => {
			dragRef.current = null;
			for (const id of pointers.keys()) {
				if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
			}
			cancelAnimationFrame(raf);
			observer.disconnect();
			el.removeEventListener("pointerdown", onDown);
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerup", onUp);
			el.removeEventListener("pointercancel", onUp);
			el.removeEventListener("lostpointercapture", onUp);
			el.removeEventListener("dblclick", onDouble);
		};
	}, [handlesRef, canInteract]);

	return (
		<div ref={wrapperRef} className="absolute inset-0">
			<div className="absolute right-3 top-3 z-10">
				<CanvasTouchToggle active={touchActive} onChange={setTouchActive} />
			</div>
			<canvas
				ref={canvasRef}
				className="block h-full w-full cursor-grab active:cursor-grabbing"
				style={{ touchAction }}
				aria-label={`${variant.title}, hyperbolic tiling`}
			/>
		</div>
	);
}

export default function CircleLimitGallery() {
	const { wasm, loading } = useWasm();
	const [heroId, setHeroId] = useState("heaven");
	const [tileCounts, setTileCounts] = useState<Record<string, number>>({});
	const heroRef = useRef<HTMLDivElement>(null);

	const handleBuilt = useCallback((id: string, count: number) => {
		setTileCounts((prev) =>
			prev[id] && prev[id] >= count ? prev : { ...prev, [id]: count },
		);
	}, []);

	const hero = VARIANTS.find((v) => v.id === heroId) ?? VARIANTS[0];

	const stage = useCallback((id: string) => {
		setHeroId(id);
		heroRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, []);

	if (loading) {
		return (
			<div className="grid h-96 place-items-center font-mono text-xs text-dim">
				Loading the tilings…
			</div>
		);
	}

	if (!wasm) {
		return (
			<p className="font-mono text-sm text-destructive">
				The WebAssembly module failed to load.
			</p>
		);
	}

	return (
		<div>
			<figure
				ref={heroRef}
				className="grid gap-px border border-rule bg-rule lg:grid-cols-[minmax(0,1fr)_280px]"
			>
				<div className="relative aspect-square bg-charcoal lg:aspect-auto lg:min-h-[640px]">
					<StagedPlate
						key={`hero-${hero.id}`}
						variant={hero}
						onBuilt={handleBuilt}
					/>
				</div>
				<figcaption className="paper flex flex-col justify-between gap-6 p-6">
					<div>
						<p className="eyebrow">
							Plate {hero.plate} · {`{${hero.p},${hero.q}}`} · on view
						</p>
						<p className="mt-3 font-display text-2xl font-medium tracking-tight">
							{hero.title}
						</p>
						<p className="mt-3 font-serif text-lg leading-snug">{hero.blurb}</p>
					</div>
					<p className="font-mono text-[11px] leading-relaxed text-dim">
						{tileCounts[hero.id]
							? `${tileCounts[hero.id].toLocaleString()} reflected tiles`
							: "—"}
						<br />
						drag to rotate · Ctrl/⌘ + scroll to zoom · double-click to recenter
						<br />
						Touch: tap Interact to rotate and pinch. Tap Done to scroll.
					</p>
				</figcaption>
			</figure>

			<div className="mt-16">
				<div className="mb-6 flex items-baseline justify-between">
					<h2 className="eyebrow">Choose a tiling</h2>
					<p className="eyebrow">Select a tiling · Ctrl/⌘ + scroll to zoom</p>
				</div>

				<ol className="grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
					{VARIANTS.map((variant, index) => {
						const onView = variant.id === heroId;
						return (
							<li key={variant.id} className="bg-charcoal">
								<button
									type="button"
									onClick={() => stage(variant.id)}
									aria-pressed={onView}
									className="group grid w-full min-w-0 grid-cols-1 text-left"
								>
									<div className="relative aspect-square min-w-0">
										<TilingView
											variant={variant}
											running
											phaseSeed={index + 1}
											rimGlow={false}
											zoomable
											onBuilt={handleBuilt}
											className="absolute inset-6 min-h-0 min-w-0 overflow-hidden"
										/>
									</div>
									<div className="border-t border-rule p-5 transition-colors group-hover:bg-charcoal-2">
										<div className="flex items-baseline justify-between">
											<span className="eyebrow">
												Plate {variant.plate} · {`{${variant.p},${variant.q}}`}
											</span>
											{onView ? (
												<span className="eyebrow text-amber">on view</span>
											) : null}
										</div>
										<div className="mt-2 font-display text-lg font-medium tracking-tight text-paper">
											{variant.title}
										</div>
										<p className="mt-1 font-serif text-sm leading-snug text-dim">
											{variant.blurb}
										</p>
									</div>
								</button>
							</li>
						);
					})}
				</ol>
			</div>
		</div>
	);
}
