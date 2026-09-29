"use client";

import { type PointerEvent, useEffect, useRef } from "react";
import { CUPS, fill, NEAR_MAX, playback, uAt, weight } from "./model";
import type { Sim } from "./sim";
import "./wheel.css";

const CX = 200;
const CY = 248;
const R = 146;
const CUP_W = 34;
const CUP_H = 30;
const WATER = CUP_H - 4;
const SPOUT = 58;
const STREAM_END = CY - R - CUP_H / 2 + 6;
const HISTORY = 96;
const SLOP = 6;

const around = (i: number) => (i / CUPS) * Math.PI * 2;
const at = (theta: number) => ({
	x: CX + R * Math.sin(theta),
	y: CY - R * Math.cos(theta),
});
const fixed = (v: number) => v.toFixed(2);

const direction = (x: number) =>
	x > 0.25 ? "clockwise" : x < -0.25 ? "anticlockwise" : "still";

interface Press {
	id: number;
	x: number;
	y: number;
	angle: number;
	t: number;
	cup: number;
	spinning: boolean;
}

export function WheelView({
	sim,
	paused,
}: {
	sim: Sim | null;
	paused: boolean;
}) {
	const svg = useRef<SVGSVGElement>(null);
	const spokes = useRef<SVGGElement>(null);
	const cups = useRef<(SVGGElement | null)[]>([]);
	const water = useRef<(SVGRectElement | null)[]>([]);
	const drips = useRef<(SVGLineElement | null)[]>([]);
	const ghost = useRef<SVGGElement>(null);
	const ghostCups = useRef<(SVGRectElement | null)[]>([]);
	const stream = useRef<SVGLineElement>(null);
	const knob = useRef<SVGLineElement>(null);
	const dot = useRef<SVGCircleElement>(null);
	const trace = useRef<SVGPolylineElement>(null);
	const hub = useRef<SVGCircleElement>(null);
	const press = useRef<Press | null>(null);

	useEffect(() => {
		if (!sim) return;
		const history: string[] = [];
		const draw = () => {
			const w = sim.wheel;
			const angle = w.angle();
			const y = w.y();
			const z = w.z();
			const rho = sim.rho;
			spokes.current?.setAttribute(
				"transform",
				`rotate(${((angle * 180) / Math.PI).toFixed(3)} ${CX} ${CY})`,
			);
			for (let i = 0; i < CUPS; i++) {
				const th = angle + around(i);
				const p = at(th);
				cups.current[i]?.setAttribute(
					"transform",
					`translate(${fixed(p.x)} ${fixed(p.y)})`,
				);
				const f = fill(th, y, z, rho);
				const h = WATER * f;
				water.current[i]?.setAttribute("y", fixed(CUP_H / 2 - 2 - h));
				water.current[i]?.setAttribute("height", fixed(h));
				drips.current[i]?.setAttribute("opacity", (f * 0.95).toFixed(2));
			}
			const c = sim.copy;
			if (ghost.current) ghost.current.style.display = c ? "" : "none";
			if (c) {
				const ca = c.angle();
				for (let i = 0; i < CUPS; i++) {
					const p = at(ca + around(i));
					const el = ghostCups.current[i];
					el?.setAttribute("x", fixed(p.x - CUP_W / 2));
					el?.setAttribute("y", fixed(p.y - CUP_H / 2));
				}
			}
			const wt = weight(y, z, rho);
			const wx = CX + R * wt.right;
			const wy = CY - R * wt.up;
			dot.current?.setAttribute("cx", fixed(wx));
			dot.current?.setAttribute("cy", fixed(wy));
			history.push(`${wx.toFixed(1)},${wy.toFixed(1)}`);
			if (history.length > HISTORY) history.shift();
			trace.current?.setAttribute("points", history.join(" "));
			const flow = Math.sqrt(Math.min(rho, NEAR_MAX) / NEAR_MAX);
			const width = rho < 0.02 ? 0 : 1.5 + 8 * flow;
			stream.current?.setAttribute("stroke-width", fixed(width));
			knob.current?.setAttribute(
				"transform",
				`rotate(${fixed(-135 + 270 * uAt(rho))} 128 32)`,
			);
			hub.current?.setAttribute("data-dir", direction(w.x()));
		};
		draw();
		return sim.subscribe(draw);
	}, [sim]);

	const local = (e: PointerEvent<SVGSVGElement>) => {
		const el = svg.current;
		if (!el) return null;
		const box = el.getBoundingClientRect();
		const scale = Math.max(400 / box.width, 440 / box.height);
		const ox = (box.width * scale - 400) / 2;
		const oy = (box.height * scale - 440) / 2;
		return {
			x: (e.clientX - box.left) * scale - ox,
			y: (e.clientY - box.top) * scale - oy,
		};
	};

	const cupAt = (x: number, y: number) => {
		if (!sim) return -1;
		const angle = sim.wheel.angle();
		for (let i = 0; i < CUPS; i++) {
			const p = at(angle + around(i));
			if (
				Math.abs(x - p.x) < CUP_W / 2 + 6 &&
				Math.abs(y - p.y) < CUP_H / 2 + 8
			)
				return i;
		}
		return -1;
	};

	const onDown = (e: PointerEvent<SVGSVGElement>) => {
		if (!sim) return;
		const p = local(e);
		if (!p) return;
		const dx = p.x - CX;
		const dy = p.y - CY;
		if (Math.hypot(dx, dy) > R + CUP_H) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		press.current = {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			angle: Math.atan2(dx, -dy),
			t: performance.now(),
			cup: cupAt(p.x, p.y),
			spinning: false,
		};
	};

	const onMove = (e: PointerEvent<SVGSVGElement>) => {
		const d = press.current;
		if (!sim || !d || d.id !== e.pointerId) return;
		if (!d.spinning && Math.hypot(e.clientX - d.x, e.clientY - d.y) < SLOP)
			return;
		const p = local(e);
		if (!p) return;
		const angle = Math.atan2(p.x - CX, -(p.y - CY));
		const now = performance.now();
		const dt = (now - d.t) / 1000;
		d.spinning = true;
		if (dt < 0.008) return;
		let turn = angle - d.angle;
		if (turn > Math.PI) turn -= Math.PI * 2;
		if (turn < -Math.PI) turn += Math.PI * 2;
		sim.spinTo(0.6 * (turn / dt / playback(sim.rho)) + 0.4 * sim.wheel.x());
		d.angle = angle;
		d.t = now;
		if (paused) sim.emit();
	};

	const onUp = (e: PointerEvent<SVGSVGElement>) => {
		const d = press.current;
		if (!sim || !d || d.id !== e.pointerId) return;
		press.current = null;
		if (d.spinning || d.cup < 0) return;
		sim.pour(sim.wheel.angle() + around(d.cup));
		sim.emit();
	};

	return (
		<svg
			ref={svg}
			className="at-wheel"
			viewBox="0 0 400 440"
			role="img"
			aria-label="A wheel of twelve leaky cups under a running tap. Drag it to spin it, or tap a cup to splash water into it."
			data-paused={paused}
			onPointerDown={onDown}
			onPointerMove={onMove}
			onPointerUp={onUp}
			onPointerCancel={() => {
				press.current = null;
			}}
		>
			<line
				ref={stream}
				className="at-wheel__stream"
				x1={CX}
				y1={SPOUT}
				x2={CX}
				y2={STREAM_END}
				strokeWidth={0}
			/>
			<path
				className="at-wheel__pipe"
				d={`M60 26 H${CX + 8} V${SPOUT} H${CX - 8} V38 H60 Z`}
			/>
			<circle className="at-wheel__knob" cx={128} cy={32} r={15} />
			<line
				ref={knob}
				className="at-wheel__pointer"
				x1={128}
				y1={32}
				x2={128}
				y2={21}
			/>
			<circle className="at-wheel__rim" cx={CX} cy={CY} r={R} />
			<g ref={spokes}>
				{Array.from({ length: CUPS }, (_, i) => (
					<line
						key={i}
						className={
							i === 0
								? "at-wheel__spoke at-wheel__spoke--index"
								: "at-wheel__spoke"
						}
						x1={CX}
						y1={CY}
						x2={fixed(at(around(i)).x)}
						y2={fixed(at(around(i)).y)}
					/>
				))}
			</g>
			<polyline ref={trace} className="at-wheel__trace" points="" />
			{Array.from({ length: CUPS }, (_, i) => (
				<g
					key={i}
					ref={(el) => {
						cups.current[i] = el;
					}}
					className="at-wheel__cupgroup"
					transform={`translate(${fixed(at(around(i)).x)} ${fixed(at(around(i)).y)})`}
				>
					<line
						ref={(el) => {
							drips.current[i] = el;
						}}
						className="at-wheel__drip"
						x1={0}
						y1={CUP_H / 2 + 3}
						x2={0}
						y2={CUP_H / 2 + 16}
						opacity={0}
					/>
					<rect
						className="at-wheel__back"
						x={-CUP_W / 2}
						y={-CUP_H / 2}
						width={CUP_W}
						height={CUP_H}
					/>
					<rect
						ref={(el) => {
							water.current[i] = el;
						}}
						className="at-wheel__water"
						x={-CUP_W / 2 + 3}
						y={CUP_H / 2 - 2}
						width={CUP_W - 6}
						height={0}
					/>
					<path
						className="at-wheel__cup"
						d={`M${-CUP_W / 2} ${-CUP_H / 2} V${CUP_H / 2} H${CUP_W / 2} V${-CUP_H / 2}`}
					/>
				</g>
			))}
			<g ref={ghost} className="at-wheel__ghost" style={{ display: "none" }}>
				{Array.from({ length: CUPS }, (_, i) => (
					<rect
						key={i}
						ref={(el) => {
							ghostCups.current[i] = el;
						}}
						width={CUP_W}
						height={CUP_H}
					/>
				))}
			</g>
			<circle
				ref={hub}
				className="at-wheel__hub"
				cx={CX}
				cy={CY}
				r={8}
				data-dir="still"
			/>
			<circle ref={dot} className="at-wheel__weight" cx={CX} cy={CY} r={7} />
		</svg>
	);
}
