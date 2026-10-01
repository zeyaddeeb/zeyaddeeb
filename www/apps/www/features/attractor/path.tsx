"use client";

import { type PointerEvent, useEffect, useRef } from "react";
import { observe, palette, type Surface } from "./canvas";
import { fixedSpin } from "./model";
import type { Ring, Sim } from "./sim";

const BUCKETS = 8;
const PAD = 16;
const SLOP = 8;

interface View {
	x: number;
	lo: number;
	hi: number;
	w: number;
	h: number;
}

export function PathView({
	sim,
	onDrop,
}: {
	sim: Sim | null;
	onDrop: () => void;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const view = useRef<View>({ x: 1.5, lo: 0, hi: 2, w: 1, h: 1 });
	const press = useRef<{ id: number; x: number; y: number } | null>(null);

	useEffect(() => {
		const cv = canvas.current;

		if (!cv || !sim) return;

		const colors = palette(cv);
		const v = view.current;
		let surface: Surface | null = null;
		let fresh = true;

		const bounds = (ring: Ring, acc: { x: number; lo: number; hi: number }) => {
			const d = ring.data;

			for (let k = 0; k < ring.size; k++) {
				const i = ring.at(k);
				const x = Math.abs(d[i] ?? 0);
				const z = d[i + 2] ?? 0;

				if (x > acc.x) acc.x = x;

				if (z < acc.lo) acc.lo = z;

				if (z > acc.hi) acc.hi = z;
			}
		};

		const draw = (dt: number) => {
			if (!surface) return;

			const { ctx, w, h } = surface;

			const acc = {
				x: 0,
				lo: Number.POSITIVE_INFINITY,
				hi: Number.NEGATIVE_INFINITY,
			};

			bounds(sim.trail, acc);
			bounds(sim.copyTrail, acc);

			if (!Number.isFinite(acc.lo)) {
				acc.lo = 0;
				acc.hi = 1;
			}

			const tx = Math.max(acc.x * 1.08, 1 + fixedSpin(sim.rho) * 0.8, 1.5);
			const span = Math.max(acc.hi - acc.lo, 2 + sim.rho * 0.25);
			const mid = (acc.hi + acc.lo) / 2;
			const k = fresh || dt === 0 ? 1 : 1 - Math.exp(-dt / 0.35);

			fresh = false;
			v.x += (tx - v.x) * k;
			v.lo += (mid - span * 0.54 - v.lo) * k;
			v.hi += (mid + span * 0.54 - v.hi) * k;
			v.w = w;
			v.h = h;

			const sx = (x: number) => w / 2 + (x / v.x) * (w / 2 - PAD);
			const sy = (z: number) =>
				PAD + ((z - v.lo) / (v.hi - v.lo)) * (h - PAD * 2);

			ctx.clearRect(0, 0, w, h);
			ctx.globalAlpha = 0.22;
			ctx.strokeStyle = colors.paper;
			ctx.lineWidth = 1;
			ctx.setLineDash([2, 5]);
			ctx.beginPath();
			ctx.moveTo(Math.round(w / 2) + 0.5, 6);
			ctx.lineTo(Math.round(w / 2) + 0.5, h - 6);
			ctx.stroke();
			ctx.setLineDash([]);

			const ring = sim.trail;
			const d = ring.data;
			const n = ring.size;
			const faded = sim.crowd ? 0.45 : 1;

			ctx.lineWidth = 1.2;
			ctx.lineJoin = "round";

			for (let b = 0; b < BUCKETS; b++) {
				const from = Math.max(1, Math.floor((b * n) / BUCKETS));
				const to = Math.floor(((b + 1) * n) / BUCKETS);
				const right = new Path2D();
				const left = new Path2D();
				let lastRight = -2;
				let lastLeft = -2;

				for (let k = from; k < to; k++) {
					const p = ring.at(k - 1);
					const c = ring.at(k);
					const px = d[p] ?? 0;

					if (Number.isNaN(px) || Number.isNaN(d[c] ?? 0)) continue;

					const onRight = px >= 0;
					const path = onRight ? right : left;
					const last = onRight ? lastRight : lastLeft;

					if (last !== k - 1) path.moveTo(sx(px), sy(d[p + 2] ?? 0));

					path.lineTo(sx(d[c] ?? 0), sy(d[c + 2] ?? 0));

					if (onRight) lastRight = k;
					else lastLeft = k;
				}

				ctx.globalAlpha = (0.08 + 0.8 * ((b + 1) / BUCKETS) ** 2) * faded;
				ctx.strokeStyle = colors.red;
				ctx.stroke(right);
				ctx.strokeStyle = colors.yellow;
				ctx.stroke(left);
			}

			const copy = sim.copyTrail;

			if (sim.copy && copy.size > 1) {
				const cd = copy.data;

				ctx.globalAlpha = 0.75;
				ctx.strokeStyle = colors.paper;
				ctx.lineWidth = 1;
				ctx.setLineDash([3, 3]);
				ctx.beginPath();

				let pen = false;

				for (let k = 0; k < copy.size; k++) {
					const i = copy.at(k);
					const cx = cd[i] ?? 0;

					if (Number.isNaN(cx)) {
						pen = false;

						continue;
					}

					const X = sx(cx);
					const Y = sy(cd[i + 2] ?? 0);

					if (pen) ctx.lineTo(X, Y);
					else ctx.moveTo(X, Y);

					pen = true;
				}

				ctx.stroke();
				ctx.setLineDash([]);
			}

			const streaks = sim.streaks;
			const now = streaks[streaks.length - 1];

			if (now) {
				ctx.lineWidth = 1.5;
				ctx.globalAlpha = 0.7;
				ctx.strokeStyle = colors.paper;
				ctx.beginPath();

				for (let i = 0; i + 2 < now.length; i += 3) {
					const first = streaks[0];

					ctx.moveTo(sx(first?.[i] ?? 0), sy(first?.[i + 2] ?? 0));

					for (const frame of streaks)
						ctx.lineTo(sx(frame[i] ?? 0), sy(frame[i + 2] ?? 0));
				}

				ctx.stroke();
				ctx.globalAlpha = 1;

				for (let i = 0; i + 2 < now.length; i += 3) {
					const x = now[i] ?? 0;

					ctx.fillStyle = x >= 0 ? colors.red : colors.yellow;
					ctx.fillRect(sx(x) - 2.5, sy(now[i + 2] ?? 0) - 2.5, 5, 5);
				}
			}

			ctx.globalAlpha = 1;

			const wx = sim.wheel.x();

			ctx.fillStyle = wx >= 0 ? colors.red : colors.yellow;
			ctx.strokeStyle = colors.dark;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(sx(wx), sy(sim.wheel.z()), 5.5, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();

			if (sim.copy) {
				ctx.strokeStyle = colors.paper;
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(sx(sim.copy.x()), sy(sim.copy.z()), 8, 0, Math.PI * 2);
				ctx.stroke();
			}
		};

		const stop = observe(cv, (s) => {
			surface = s;
			draw(0);
		});

		const unsubscribe = sim.subscribe(draw);

		return () => {
			stop();
			unsubscribe();
		};
	}, [sim]);

	const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
		press.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
	};

	const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
		const p = press.current;

		press.current = null;

		if (!sim || !p || p.id !== e.pointerId) return;

		if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > SLOP) return;

		const box = e.currentTarget.getBoundingClientRect();
		const v = view.current;
		const px = e.clientX - box.left;
		const py = e.clientY - box.top;
		const x = ((px - v.w / 2) / (v.w / 2 - PAD)) * v.x;
		const z = v.lo + ((py - PAD) / (v.h - PAD * 2)) * (v.hi - v.lo);

		sim.drop("handful", x, x, z, 0.015 * v.x);
		sim.emit();
		onDrop();
	};

	return (
		<div className="at-path">
			<canvas
				ref={canvas}
				className="at-path__canvas"
				role="img"
				aria-label="The wheel's path: how fast it spins, left to right, against how high its weight sits, top to bottom. Tap anywhere to drop a handful of wheels there."
				onPointerDown={onDown}
				onPointerUp={onUp}
				onPointerCancel={() => {
					press.current = null;
				}}
			/>
			<span className="at-path__axis at-path__axis--top">weight high</span>
			<span className="at-path__axis at-path__axis--bottom">weight low</span>
			<span className="at-path__axis at-path__axis--left">anticlockwise</span>
			<span className="at-path__axis at-path__axis--right">clockwise</span>
		</div>
	);
}
