"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import type { PartId } from "./model";
import type { Stage } from "./stage";

export interface Pose {
	yaw: number;
	pitch: number;
	zoom: number;
	x?: number;
	y?: number;
	explode?: number;
	focus?: PartId | null;
	off?: ReadonlySet<PartId>;
	heat?: number;
	spin?: number;
}

const none: ReadonlySet<PartId> = new Set();
const feather =
	"linear-gradient(to right, transparent, #000 8%, #000 92%, transparent), linear-gradient(to bottom, transparent, #000 8%, #000 92%, transparent)";
const hidden: CSSProperties = {
	opacity: 0,
	maskImage: feather,
	maskComposite: "intersect",
	WebkitMaskImage: feather,
	WebkitMaskComposite: "source-in",
};

export function ModelView({
	pose,
	label,
	className,
}: {
	pose: Pose;
	label: string;
	className?: string;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const current = useRef(pose);
	const wake = useRef<() => void>(() => {});

	useEffect(() => {
		current.current = pose;
		wake.current();
	}, [pose]);

	useEffect(() => {
		const cv = canvas.current;
		if (!cv) return;
		const still = window.matchMedia("(prefers-reduced-motion: reduce)");
		let stage: Stage | null = null;
		let loading = false;
		let cancelled = false;
		const abort = new AbortController();
		let shown = false;
		let w = 0;
		let h = 0;
		let dpr = 1;
		let frame = 0;
		let visible = false;
		let turn = 0;
		let drag = 0;
		let velocity = 0;
		let pointer: { id: number; x: number; t: number } | null = null;
		let last = performance.now();
		let ease = {
			...current.current,
			explode: current.current.explode ?? 0,
			heat: current.current.heat ?? 0,
		};
		const off = new Map<PartId, number>();
		for (const part of current.current.off ?? none) off.set(part, 1);

		const size = () => {
			const r = cv.getBoundingClientRect();
			w = r.width;
			h = r.height;
			dpr = Math.min(2, Math.max(1.5, window.devicePixelRatio || 1));
			stage?.resize(w, h, dpr);
		};

		const draw = (now: number) => {
			frame = 0;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const p = current.current;
			const k = 1 - 0.0001 ** dt;
			ease = {
				...p,
				yaw: ease.yaw + (p.yaw - ease.yaw) * k,
				pitch: ease.pitch + (p.pitch - ease.pitch) * k,
				zoom: ease.zoom + (p.zoom - ease.zoom) * k,
				explode: ease.explode + ((p.explode ?? 0) - ease.explode) * k,
				heat: ease.heat + ((p.heat ?? 0) - ease.heat) * k,
			};
			const dying = p.off ?? none;
			let fading = false;
			for (const part of dying) if (!off.has(part)) off.set(part, 0);
			for (const [part, value] of off) {
				const target = dying.has(part) ? 1 : 0;
				const next = value + (target - value) * k;
				const done = Math.abs(target - next) < 0.002;
				off.set(part, done ? target : next);
				if (!done) fading = true;
			}
			if (!pointer) {
				drag += velocity * dt;
				velocity *= 0.92 ** (dt * 60);
			}
			const spinning = !still.matches && (p.spin ?? 0) > 0;
			if (spinning) turn += dt * (p.spin ?? 0);
			if (!stage) return;
			stage.draw({
				yaw: ease.yaw + turn + drag,
				pitch: ease.pitch,
				scale: (Math.min(w, h * 1.3) / 7.2) * ease.zoom,
				cx: w * (p.x ?? 0.5),
				cy: h * (p.y ?? 0.5),
				explode: ease.explode,
				focus: p.focus ?? null,
				off,
				heat: ease.heat,
			});
			if (!shown) {
				shown = true;
				cv.style.transition = still.matches ? "" : "opacity 900ms ease";
				cv.style.opacity = "1";
			}
			const settling =
				Math.abs(p.yaw - ease.yaw) > 0.001 ||
				Math.abs(p.pitch - ease.pitch) > 0.001 ||
				Math.abs(p.zoom - ease.zoom) > 0.001 ||
				Math.abs((p.explode ?? 0) - ease.explode) > 0.001 ||
				Math.abs((p.heat ?? 0) - ease.heat) > 0.002 ||
				Math.abs(velocity) > 0.001 ||
				fading;
			if (visible && (spinning || settling || pointer))
				frame = requestAnimationFrame(draw);
		};

		const kick = () => {
			if (!frame && visible) {
				last = performance.now();
				frame = requestAnimationFrame(draw);
			}
		};
		wake.current = kick;

		const load = () => {
			if (loading) return;
			loading = true;
			import("./stage")
				.then(({ createStage }) => {
					if (cancelled) return null;
					return createStage(cv, { shadow: 1024, signal: abort.signal });
				})
				.then((made) => {
					if (!made) return;
					if (cancelled) {
						made.dispose();
						return;
					}
					stage = made;
					size();
					kick();
				})
				.catch(() => {});
		};

		const down = (e: PointerEvent) => {
			pointer = { id: e.pointerId, x: e.clientX, t: performance.now() };
			velocity = 0;
			kick();
		};
		const move = (e: PointerEvent) => {
			if (!pointer || e.pointerId !== pointer.id) return;
			const now = performance.now();
			const d = ((e.clientX - pointer.x) / Math.max(280, w)) * Math.PI * 1.4;
			drag += d;
			velocity = d / Math.max(0.008, (now - pointer.t) / 1000);
			pointer = { id: e.pointerId, x: e.clientX, t: now };
		};
		const up = (e: PointerEvent) => {
			if (pointer && e.pointerId === pointer.id) pointer = null;
		};

		const near = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					load();
					near.disconnect();
				}
			},
			{ rootMargin: "100% 0px" },
		);
		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			kick();
		});
		const ro = new ResizeObserver(() => {
			size();
			kick();
		});
		size();
		near.observe(cv);
		io.observe(cv);
		ro.observe(cv);
		cv.addEventListener("pointerdown", down);
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", up);
		return () => {
			cancelled = true;
			abort.abort();
			cancelAnimationFrame(frame);
			near.disconnect();
			io.disconnect();
			ro.disconnect();
			wake.current = () => {};
			cv.removeEventListener("pointerdown", down);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", up);
			stage?.dispose();
			stage = null;
		};
	}, []);

	return (
		<canvas
			ref={canvas}
			className={className ?? "vg-model"}
			style={hidden}
			role="img"
			aria-label={label}
		/>
	);
}
