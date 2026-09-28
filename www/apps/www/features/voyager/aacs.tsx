"use client";

import type { Aacs } from "@zeyaddeeb/wasm";
import {
	type CSSProperties,
	type PointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { useWasm } from "@/lib/hooks/use-wasm";
import { Code } from "./code";
import { BEAM_DEG, PULSES_PER_DAY } from "./facts";
import "./aacs.css";

const RATE = 900;
const SUBSTEP = 20;
const TRAIL = 900;
const DAY = 86_400;
const MIN = 0.04;
const MAX = 0.6;
const EDGE = BEAM_DEG / 2;
const SNAP = 0.012;
const KNOB = 14;
const REACH = 22;
const SLOP = 10;

const GOLD = "232, 179, 85";
const BLUE = "109, 146, 201";
const RED = "210, 89, 63";
const INK = "245, 242, 233";

type Hit = "plus" | "minus" | null;

interface Fire {
	t: number;
	axis: "yaw" | "pitch";
	dir: number;
}

interface Drag {
	id: number;
	x: number;
	y: number;
	last: number;
	from: number;
	grab: number;
	live: boolean;
	touch: boolean;
}

const along = (v: number) => (v - MIN) / (MAX - MIN);

const onTrack = (v: number) =>
	`calc(14px + (100% - 28px) * ${along(v).toFixed(4)})`;

function tag(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
) {
	const w = ctx.measureText(text).width;
	ctx.fillStyle = "#121211";
	ctx.fillRect(x - 4, y - 2, w + 8, 18);
	ctx.fillStyle = `rgba(${INK}, 0.62)`;
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillText(text, x, y + 1);
}

const lossText = (db: number) =>
	Math.abs(db) < 0.05 ? "0.0" : Math.abs(db).toFixed(1);

export function Pointing() {
	const { wasm } = useWasm();
	const [deadband, setDeadband] = useState(0.1);
	const [hit, setHit] = useState<{ axis: Hit; n: number }>({
		axis: null,
		n: 0,
	});
	const views = useRef<HTMLDivElement>(null);
	const target = useRef<HTMLCanvasElement>(null);
	const phase = useRef<HTMLCanvasElement>(null);
	const perDay = useRef<HTMLElement>(null);
	const worst = useRef<HTMLElement>(null);
	const sim = useRef<{ yaw: Aacs; pitch: Aacs } | null>(null);
	const band = useRef(deadband);
	const bump = useRef(0);
	const repaint = useRef<(() => void) | null>(null);
	const track = useRef<HTMLSpanElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const drag = useRef<Drag | null>(null);
	const out = deadband > EDGE;

	useEffect(() => {
		band.current = deadband;
		const s = sim.current;
		if (s) {
			s.yaw.set_deadband(deadband);
			s.pitch.set_deadband(deadband * 0.8);
		}
		repaint.current?.();
	}, [deadband]);

	useEffect(() => {
		if (!wasm) return;
		const cvTarget = target.current;
		const cvPhase = phase.current;
		const box = views.current;
		if (!cvTarget || !cvPhase || !box) return;
		const yaw = new wasm.Aacs(band.current);
		const pitch = new wasm.Aacs(band.current * 0.8);
		pitch.nudge(-wasm.kick() * 0.18);
		sim.current = { yaw, pitch };
		const beam = wasm.beamwidth();
		const kick = wasm.kick();
		const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const font = `12px ${getComputedStyle(cvTarget).fontFamily || "ui-monospace, monospace"}`;
		const trail: { x: number; y: number; r: number }[] = [];
		const fires: Fire[] = [];
		const pulses: number[] = [];
		const size = new Map<HTMLCanvasElement, { w: number; h: number }>();
		let dpr = Math.min(2, window.devicePixelRatio || 1);
		let simTime = 0;
		let frame = 0;
		let last = performance.now();
		let lastText = 0;
		let visible = false;
		let low = 0;
		let axis: Hit = null;

		const run = (span: number, warm: boolean) => {
			let t = 0;
			let fired = 0;
			while (t < span) {
				const step = Math.min(SUBSTEP, span - t);
				const a = yaw.step(step);
				const b = pitch.step(step);
				simTime += step;
				t += step;
				if (a !== 0 || b !== 0) {
					pulses.push(simTime);
					if (a !== 0)
						fires.push({ t: simTime, axis: "yaw", dir: a === 2 ? 1 : -1 });
					if (b !== 0)
						fires.push({ t: simTime, axis: "pitch", dir: b === 2 ? 1 : -1 });
					axis = (a || b) === 1 ? "plus" : "minus";
					fired++;
				}
				if (warm) {
					trail.push({ x: yaw.error(), y: pitch.error(), r: yaw.rate() });
					low = Math.min(yaw.signal_db() + pitch.signal_db(), low * 0.9995);
				}
			}
			while (fires.length > 8) fires.shift();
			while (pulses.length && simTime - pulses[0] >= 2 * DAY) pulses.shift();
			while (trail.length > TRAIL) trail.shift();
			return fired;
		};

		const canvas = (cv: HTMLCanvasElement) => {
			const s = size.get(cv);
			const ctx = cv.getContext("2d");
			if (!s || !ctx || !s.w || !s.h) return null;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, s.w, s.h);
			ctx.font = font;
			return { ctx, w: s.w, h: s.h };
		};

		const drawTarget = () => {
			const c = canvas(cvTarget);
			if (!c) return;
			const { ctx, w, h } = c;
			const cx = w / 2;
			const cy = h / 2;
			const unit = (Math.min(w, h) / 2 - 12) / 0.75;
			const db = band.current;
			const e = trail[trail.length - 1];
			const outside = e ? Math.hypot(e.x, e.y) > beam / 2 : false;
			for (let k = 4; k >= 1; k--) {
				ctx.fillStyle = `rgba(${BLUE}, ${(0.03 * (5 - k)).toFixed(3)})`;
				ctx.beginPath();
				ctx.arc(cx, cy, (beam / 2) * (k / 2) * unit, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.strokeStyle = `rgba(${INK}, 0.1)`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(cx, 8);
			ctx.lineTo(cx, h - 8);
			ctx.moveTo(8, cy);
			ctx.lineTo(w - 8, cy);
			ctx.stroke();
			ctx.strokeStyle = outside ? `rgb(${RED})` : `rgba(${BLUE}, 0.9)`;
			ctx.lineWidth = 1.25;
			ctx.beginPath();
			ctx.arc(cx, cy, (beam / 2) * unit, 0, Math.PI * 2);
			ctx.stroke();
			ctx.setLineDash([4, 5]);
			ctx.strokeStyle = `rgba(${INK}, 0.45)`;
			ctx.lineWidth = 1;
			ctx.strokeRect(
				cx - db * unit,
				cy - db * 0.8 * unit,
				db * 2 * unit,
				db * 1.6 * unit,
			);
			ctx.setLineDash([]);
			for (const f of fires) {
				const age = (simTime - f.t) / (RATE * 0.8);
				if (age > 1) continue;
				ctx.strokeStyle = `rgba(${GOLD}, ${(1 - age).toFixed(3)})`;
				ctx.lineWidth = 3;
				ctx.beginPath();
				if (f.axis === "yaw") {
					const x = cx + f.dir * db * unit;
					ctx.moveTo(x, cy - db * 0.8 * unit);
					ctx.lineTo(x, cy + db * 0.8 * unit);
				} else {
					const y = cy - f.dir * db * 0.8 * unit;
					ctx.moveTo(cx - db * unit, y);
					ctx.lineTo(cx + db * unit, y);
				}
				ctx.stroke();
			}
			ctx.lineWidth = 1.4;
			for (let i = 1; i < trail.length; i++) {
				const a = trail[i - 1];
				const b = trail[i];
				ctx.strokeStyle = `rgba(${BLUE}, ${((i / trail.length) * 0.8).toFixed(3)})`;
				ctx.beginPath();
				ctx.moveTo(cx + a.x * unit, cy - a.y * unit);
				ctx.lineTo(cx + b.x * unit, cy - b.y * unit);
				ctx.stroke();
			}
			if (e) {
				ctx.fillStyle = `rgb(${BLUE})`;
				ctx.beginPath();
				ctx.arc(cx + e.x * unit, cy - e.y * unit, 6, 0, Math.PI * 2);
				ctx.fill();
				ctx.strokeStyle = `rgba(${INK}, 0.9)`;
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}
			tag(ctx, `Half-power beam ${beam.toFixed(2)}°`, 12, h - 24);
		};

		const drawPhase = () => {
			const c = canvas(cvPhase);
			if (!c) return;
			const { ctx, w, h } = c;
			const small = w < 200;
			const pad = small ? 10 : 16;
			const cx = w / 2;
			const cy = h / 2;
			const xs = (w / 2 - pad) / 0.65;
			const ys = (h / 2 - pad) / (kick * 1.6);
			const db = band.current;
			ctx.fillStyle = `rgba(${INK}, 0.06)`;
			ctx.fillRect(cx - db * xs, 0, db * 2 * xs, h);
			ctx.strokeStyle = `rgba(${INK}, 0.12)`;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(pad / 2, cy);
			ctx.lineTo(w - pad / 2, cy);
			ctx.moveTo(cx, pad / 2);
			ctx.lineTo(cx, h - pad / 2);
			ctx.stroke();
			ctx.setLineDash([4, 5]);
			ctx.strokeStyle = `rgba(${INK}, 0.45)`;
			ctx.beginPath();
			ctx.moveTo(cx - db * xs, 0);
			ctx.lineTo(cx - db * xs, h);
			ctx.moveTo(cx + db * xs, 0);
			ctx.lineTo(cx + db * xs, h);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.lineWidth = small ? 1.2 : 1.6;
			for (let i = 1; i < trail.length; i++) {
				const a = trail[i - 1];
				const b = trail[i];
				ctx.strokeStyle = `rgba(${GOLD}, ${((i / trail.length) * 0.9).toFixed(3)})`;
				ctx.beginPath();
				ctx.moveTo(cx + a.x * xs, cy - a.r * ys);
				ctx.lineTo(cx + b.x * xs, cy - b.r * ys);
				ctx.stroke();
			}
			const e = trail[trail.length - 1];
			if (e) {
				ctx.fillStyle = `rgb(${GOLD})`;
				ctx.beginPath();
				ctx.arc(cx + e.x * xs, cy - e.r * ys, small ? 3 : 4, 0, Math.PI * 2);
				ctx.fill();
			}
			if (!small) {
				tag(ctx, "Rate", cx + 8, 10);
				tag(ctx, "Error", w - 12 - ctx.measureText("Error").width, cy - 22);
			}
		};

		const text = () => {
			const days = Math.min(2, simTime / DAY);
			if (perDay.current && days > 0.05)
				perDay.current.textContent = String(Math.round(pulses.length / days));
			if (worst.current) worst.current.textContent = lossText(low);
		};

		const paint = () => {
			drawTarget();
			drawPhase();
		};

		const loop = (now: number) => {
			frame = 0;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			if (bump.current) {
				yaw.nudge(kick * 0.9 * bump.current);
				pitch.nudge(-kick * 0.5 * bump.current);
				bump.current = 0;
			}
			const fired = run((still ? 0.25 : 1) * RATE * dt, false);
			if (fired) {
				const next = axis;
				setHit((h) => ({ axis: next, n: h.n + 1 }));
			}
			trail.push({ x: yaw.error(), y: pitch.error(), r: yaw.rate() });
			while (trail.length > TRAIL) trail.shift();
			low = Math.min(yaw.signal_db() + pitch.signal_db(), low * 0.9995);
			paint();
			if (now - lastText > 250) {
				lastText = now;
				text();
			}
			if (visible) frame = requestAnimationFrame(loop);
		};

		run(DAY, true);
		setHit({ axis, n: 0 });
		text();
		repaint.current = () => {
			if (!visible) paint();
		};

		const ro = new ResizeObserver((entries) => {
			dpr = Math.min(2, window.devicePixelRatio || 1);
			for (const entry of entries) {
				const cv = entry.target as HTMLCanvasElement;
				const { width, height } = entry.contentRect;
				size.set(cv, { w: width, h: height });
				cv.width = Math.max(1, Math.round(width * dpr));
				cv.height = Math.max(1, Math.round(height * dpr));
			}
			paint();
		});
		ro.observe(cvTarget);
		ro.observe(cvPhase);

		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible && !frame) {
				last = performance.now();
				frame = requestAnimationFrame(loop);
			}
		});
		io.observe(box);

		return () => {
			cancelAnimationFrame(frame);
			io.disconnect();
			ro.disconnect();
			repaint.current = null;
			sim.current = null;
			yaw.free();
			pitch.free();
		};
	}, [wasm]);

	const hot =
		hit.axis === "plus"
			? "return Pulse::Plus"
			: hit.axis === "minus"
				? "return Pulse::Minus"
				: "self.error += self.rate";

	const pick = (v: number) => setDeadband(Math.abs(v - EDGE) < SNAP ? EDGE : v);

	const rail = () => {
		const r = track.current?.getBoundingClientRect();
		return r && r.width > KNOB * 2 ? r : null;
	};

	const valueAt = (r: DOMRect, x: number) => {
		const t = (x - r.left - KNOB) / (r.width - KNOB * 2);
		const v = MIN + Math.min(1, Math.max(0, t)) * (MAX - MIN);
		return Math.round(v * 100) / 100;
	};

	const down = (e: PointerEvent<HTMLSpanElement>) => {
		if (e.button !== 0) return;
		const r = rail();
		if (!r) return;
		const grab =
			e.clientX - (r.left + KNOB + (r.width - KNOB * 2) * along(deadband));
		const near = Math.abs(grab) <= REACH;
		const touch = e.pointerType !== "mouse";
		drag.current = {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			last: e.clientX,
			from: deadband,
			grab: near ? grab : 0,
			live: near || !touch,
			touch,
		};
		if (touch && !near) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		if (touch) return;
		e.preventDefault();
		input.current?.focus({ preventScroll: true });
		if (!near) pick(valueAt(r, e.clientX));
	};

	const move = (e: PointerEvent<HTMLSpanElement>) => {
		const d = drag.current;
		if (!d || d.id !== e.pointerId) return;
		d.last = e.clientX;
		if (!d.live) {
			const dx = e.clientX - d.x;
			const dy = e.clientY - d.y;
			if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) {
				drag.current = null;
				return;
			}
			if (Math.abs(dx) < SLOP) return;
			d.live = true;
			e.currentTarget.setPointerCapture(e.pointerId);
		}
		const r = rail();
		if (r) pick(valueAt(r, e.clientX - d.grab));
	};

	const end = (e: PointerEvent<HTMLSpanElement>) => {
		if (drag.current?.id === e.pointerId) drag.current = null;
	};

	const cancel = (e: PointerEvent<HTMLSpanElement>) => {
		const d = drag.current;
		if (!d || d.id !== e.pointerId) return;
		drag.current = null;
		if (d.touch && Math.abs(d.last - d.x) < SLOP) pick(d.from);
	};

	return (
		<div className="vg-aacs">
			<div className="vg-aacs__demo">
				<div className="vg-aacs__views" ref={views}>
					<figure className="vg-view vg-view--beam">
						<div className="vg-view__plot">
							<canvas
								ref={target}
								aria-label="Earth's position inside Voyager's radio beam"
								role="img"
							/>
						</div>
						<figcaption className="vg-view__cap">
							<i className="vg-view__key" aria-hidden="true" />
							Earth, seen from the dish
						</figcaption>
					</figure>
					<figure className="vg-view vg-view--phase">
						<div className="vg-view__plot">
							<canvas
								ref={phase}
								aria-label="Pointing error against turn rate, one axis"
								role="img"
							/>
						</div>
						<figcaption className="vg-view__cap">
							<span className="vg-view__long">
								Error against rate, one axis
							</span>
							<span className="vg-view__short">Error vs rate</span>
						</figcaption>
					</figure>
				</div>
				<div className="vg-aacs__controls">
					<label
						className="vg-deadband"
						style={{ "--edge-at": onTrack(EDGE) } as CSSProperties}
					>
						<span className="vg-deadband__row" aria-hidden="true">
							<span>
								Deadband <b>±{deadband.toFixed(2)}°</b>
							</span>
							<span className="vg-deadband__edge">
								Beam edge ±{EDGE.toFixed(2)}°
							</span>
						</span>
						<span
							ref={track}
							className="vg-deadband__track"
							onPointerDown={down}
							onPointerMove={move}
							onPointerUp={end}
							onPointerCancel={cancel}
						>
							<input
								ref={input}
								className="vg-slider"
								type="range"
								min={MIN}
								max={MAX}
								step={0.01}
								value={deadband}
								style={{ "--fill": onTrack(deadband) } as CSSProperties}
								aria-label="Deadband"
								aria-valuetext={`Plus or minus ${deadband.toFixed(2)} degrees, ${out ? "wider than the beam" : "inside the beam"}`}
								onChange={(e) => pick(Number(e.target.value))}
							/>
						</span>
					</label>
					<button
						type="button"
						className="vg-button vg-aacs__knock"
						onClick={() => {
							bump.current = 1;
						}}
					>
						Knock it
					</button>
				</div>
				<ul className="vg-tilerow vg-aacs__stats">
					<li className="vg-tile vg-aacs__stat" data-band="gold">
						<p className="vg-tile__label">
							<span className="vg-aacs__wide">Thruster pulses a day</span>
							<span className="vg-aacs__narrow">Pulses a day</span>
						</p>
						<p className="vg-tile__value">
							<b ref={perDay}>–</b>
						</p>
						<p className="vg-tile__note">
							Voyager 1 in 2024: about {PULSES_PER_DAY}
						</p>
					</li>
					<li className="vg-tile vg-aacs__stat" data-band="blue">
						<p className="vg-tile__label">
							<span className="vg-aacs__wide">Worst signal loss</span>
							<span className="vg-aacs__narrow">Signal loss</span>
						</p>
						<p className="vg-tile__value">
							<b ref={worst}>0.0</b>
							{" "}
							<span className="vg-unit">dB</span>
						</p>
						<p className="vg-tile__note">0 dB is dead center</p>
					</li>
					<li
						className="vg-tile vg-aacs__verdict"
						data-band={out ? "red" : undefined}
						data-out={out ? "true" : undefined}
					>
						<p className="vg-tile__label">Earth</p>
						<p className="vg-tile__value vg-aacs__swap" aria-live="polite">
							<span data-on={out ? undefined : "true"}>
								<span className="vg-aacs__wide">In the beam</span>
								<span className="vg-aacs__narrow">In beam</span>
							</span>
							<span data-on={out ? "true" : undefined}>
								<span className="vg-aacs__wide">Slipping out</span>
								<span className="vg-aacs__narrow">Slipping</span>
							</span>
						</p>
						<p className="vg-tile__note vg-aacs__swap">
							<span data-on={out ? undefined : "true"}>
								The deadband sits inside the beam.
							</span>
							<span data-on={out ? "true" : undefined}>
								The deadband is wider than the beam.
							</span>
						</p>
					</li>
				</ul>
			</div>
			<Code
				className="vg-aacs__rust"
				names={["step", "fire", "signal_db"]}
				hot={hot}
				beat={hit.n}
				title="Holding Earth in the beam"
			/>
		</div>
	);
}
