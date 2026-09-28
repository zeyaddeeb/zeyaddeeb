"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { answer } from "./answer";
import { clock, span, words } from "./meat";
import { Callout, Stick } from "./stick";
import {
	locate,
	type Mode,
	type Station,
	type Step,
	speed,
	timeline,
	totals,
	trip,
	verdict,
} from "./wire";

const answerWords = words(answer).length;

interface Geo {
	w: number;
	h: number;
	wire: number;
	box: number;
	boxH: number;
	pad: number;
	you: number;
	them: number;
	half: number;
	head: number;
	peak: number;
	font: number;
	long: number;
	notes: boolean;
}

const wide: Geo = {
	w: 960,
	h: 312,
	wire: 132,
	box: 110,
	boxH: 76,
	pad: 12,
	you: 360,
	them: 600,
	half: 70,
	head: 20,
	peak: 74,
	font: 15,
	long: 46,
	notes: true,
};

const narrow: Geo = {
	w: 380,
	h: 262,
	wire: 116,
	box: 60,
	boxH: 58,
	pad: 4,
	you: 128,
	them: 252,
	half: 42,
	head: 15,
	peak: 58,
	font: 12,
	long: 30,
	notes: false,
};

type Point = [number, number];

const center = (g: Geo, s: Station) => (s === "you" ? g.you : g.them);

function edge(g: Geo, s: Station, dir: 1 | -1, side: "in" | "out") {
	if (s === "left") return g.pad + g.box;
	if (s === "right") return g.w - g.pad - g.box;
	return center(g, s) + (side === "in" ? -dir : dir) * g.half;
}

function along(points: Point[], f: number, length: number) {
	const segs = points.slice(1).map((p, i) => {
		const q = points[i];
		return Math.hypot(p[0] - q[0], p[1] - q[1]);
	});
	const total = segs.reduce((a, b) => a + b, 0);
	const at = (d: number): Point => {
		let rest = Math.max(0, Math.min(total, d));
		for (let i = 0; i < segs.length; i++) {
			if (rest <= segs[i] || i === segs.length - 1) {
				const t = segs[i] ? rest / segs[i] : 0;
				const [x0, y0] = points[i];
				const [x1, y1] = points[i + 1];
				return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
			}
			rest -= segs[i];
		}
		return points[points.length - 1];
	};
	const end = f * total;
	const start = end - length;
	const out: Point[] = [at(start)];
	let acc = 0;
	for (let i = 0; i < segs.length; i++) {
		acc += segs[i];
		if (acc > start && acc < end) out.push(points[i + 1]);
	}
	out.push(at(end));
	return out;
}

function packet(g: Geo, step: Step, progress: number) {
	const length = Math.max(8, (step.words / answerWords) * g.long);
	const y = g.wire;
	if (step.kind === "travel" && step.to) {
		const from = edge(g, step.at, step.dir, "out");
		const to = edge(g, step.to, step.dir, "in");
		return along(
			[
				[from, y],
				[to, y],
			],
			progress,
			length,
		);
	}
	if (step.kind === "person" && step.mode === "paste") {
		const a = edge(g, step.at, step.dir, "in");
		const b = edge(g, step.at, step.dir, "out");
		return along(
			[
				[a, y],
				[a, y - g.peak],
				[b, y - g.peak],
				[b, y],
			],
			progress,
			Math.max(8, (step.incoming / answerWords) * g.long),
		);
	}
	return null;
}

function Drawing({
	g,
	you,
	them,
	step,
	progress,
}: {
	g: Geo;
	you: Mode;
	them: Mode;
	step: Step | null;
	progress: number;
}) {
	const s = g.head / 10;
	const feet = g.wire + 63 * s;
	const busy = (at: Station) =>
		step?.at === at &&
		(step.kind === "model" || (step.kind === "person" && step.mode === "read"));
	const snake = step ? packet(g, step, progress) : null;
	const people: ["you" | "them", Mode, string][] = [
		["you", you, "you"],
		["them", them, "your coworker"],
	];
	return (
		<svg
			viewBox={`0 0 ${g.w} ${g.h}`}
			className="mc-cable__art"
			role="img"
			aria-label="Two Claudes connected through two people, each with a paste switch that bypasses their head."
		>
			<line className="mc-floor" x1={0} x2={g.w} y1={feet} y2={feet} />
			<line
				className="mc-wire"
				x1={g.pad + g.box}
				x2={g.w - g.pad - g.box}
				y1={g.wire}
				y2={g.wire}
			/>
			{people.map(([who, mode, label]) => {
				const x = center(g, who);
				const closed = mode === "paste";
				const t = 12 * s;
				const top = g.wire - g.peak;
				const lit = busy(who);
				const ring = lit && step ? progress : 0;
				const r = g.head + 5 * s;
				return (
					<g key={who}>
						<path
							className={closed ? "mc-wire" : "mc-wire is-open"}
							d={`M${x - g.half} ${g.wire} V${top} H${x - t} M${x + t} ${top} H${x + g.half} V${g.wire}`}
						/>
						<circle className="mc-switch__pin" cx={x - t} cy={top} r={3 * s} />
						<circle className="mc-switch__pin" cx={x + t} cy={top} r={3 * s} />
						<line
							className="mc-switch__lever"
							x1={x - t}
							y1={top}
							x2={closed ? x + t : Math.round(x - t + 1.65 * t)}
							y2={closed ? top : Math.round(top - 1.13 * t)}
						/>
						<text
							className="mc-cable__key"
							x={x}
							y={top - 12 * s}
							textAnchor="middle"
							fontSize={g.font}
						>
							paste
						</text>
						<Stick x={x} y={feet} size={s} lit={lit} />
						{g.notes ? (
							<Callout
								x={x + g.head * 0.72}
								y={g.wire + g.head * 0.72}
								tx={x + g.head * 1.9}
								ty={g.wire + g.head * 2.1}
								size={g.font * 0.95}
							>
								10 bits/s
							</Callout>
						) : null}
						{ring > 0 ? (
							<circle
								className="mc-cable__ring"
								cx={x}
								cy={g.wire}
								r={r}
								pathLength={1}
								strokeDasharray={`${ring} 1`}
								transform={`rotate(-90 ${x} ${g.wire})`}
							/>
						) : null}
						<text
							className="mc-cable__name"
							x={x}
							y={feet + g.font * 1.3}
							textAnchor="middle"
							fontSize={g.font}
						>
							{label}
						</text>
					</g>
				);
			})}
			{(["left", "right"] as const).map((side) => {
				const x = side === "left" ? g.pad : g.w - g.pad - g.box;
				const on = busy(side);
				return (
					<g key={side} className={on ? "mc-model is-on" : "mc-model"}>
						<path
							className="mc-stand"
							d={`M${x + g.box / 2} ${g.wire + g.boxH / 2} V${feet} M${x + g.box / 2 - g.box * 0.2} ${feet} H${x + g.box / 2 + g.box * 0.2}`}
						/>
						<rect x={x} y={g.wire - g.boxH / 2} width={g.box} height={g.boxH} />
						<text
							x={x + g.box / 2}
							y={g.wire + g.font * 0.35}
							textAnchor="middle"
							fontSize={g.font}
						>
							Claude
						</text>
						<text
							className="mc-cable__name"
							x={x + g.box / 2}
							y={feet + g.font * 1.3}
							textAnchor="middle"
							fontSize={g.font}
						>
							{side === "left" ? "your Claude" : "their Claude"}
						</text>
					</g>
				);
			})}
			{snake && step ? (
				<polyline
					className={`mc-packet is-${step.author}`}
					points={snake.map((p) => p.join(",")).join(" ")}
					strokeWidth={8 * (g.head / 20) + 2}
				/>
			) : null}
		</svg>
	);
}

function useReducedMotion() {
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const m = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setReduced(m.matches);
		update();
		m.addEventListener("change", update);
		return () => m.removeEventListener("change", update);
	}, []);
	return reduced;
}

export function Cable() {
	const [you, setYou] = useState<Mode>("paste");
	const [them, setThem] = useState<Mode>("paste");
	const [t, setT] = useState(0);
	const box = useRef<HTMLDivElement>(null);
	const reduced = useReducedMotion();
	const steps = useMemo(() => timeline(you, them, answerWords), [you, them]);
	const round = useMemo(
		() => totals(trip(you, them, answerWords)),
		[you, them],
	);

	useEffect(() => {
		if (reduced) return;
		let frame = 0;
		let visible = false;
		let last = 0;
		const tick = (now: number) => {
			if (last) setT((v) => v + Math.min(0.1, (now - last) / 1000));
			last = now;
			frame = requestAnimationFrame(tick);
		};
		const io = new IntersectionObserver(([e]) => {
			if (e.isIntersecting && !visible) {
				visible = true;
				last = 0;
				frame = requestAnimationFrame(tick);
			} else if (!e.isIntersecting && visible) {
				visible = false;
				cancelAnimationFrame(frame);
			}
		});
		if (box.current) io.observe(box.current);
		return () => {
			io.disconnect();
			cancelAnimationFrame(frame);
		};
	}, [reduced]);

	const where = locate(steps, t);
	const step = reduced ? null : steps[where.index];
	const set = (who: "you" | "them", mode: Mode) => {
		(who === "you" ? setYou : setThem)(mode);
		setT(0);
	};

	return (
		<div className="mc-cable" ref={box}>
			<div className="mc-cable__stage">
				<div className="mc-cable__wide">
					<Drawing
						g={wide}
						you={you}
						them={them}
						step={step}
						progress={where.progress}
					/>
				</div>
				<div className="mc-cable__narrow">
					<Drawing
						g={narrow}
						you={you}
						them={them}
						step={step}
						progress={where.progress}
					/>
				</div>
			</div>
			<div className="mc-cable__controls">
				{(["you", "them"] as const).map((who) => (
					<fieldset key={who} className="mc-seg">
						<legend className="mc-eyebrow">
							{who === "you" ? "You" : "Your coworker"}
						</legend>
						{(["paste", "read"] as const).map((mode) => (
							<button
								key={mode}
								type="button"
								aria-pressed={(who === "you" ? you : them) === mode}
								onClick={() => set(who, mode)}
							>
								{mode === "paste" ? "Paste" : "Read it"}
							</button>
						))}
					</fieldset>
				))}
			</div>
			<p className="mc-cable__verdict">{verdict(you, them)}</p>
			<dl className="mc-stats">
				<div>
					<dt>Round trip</dt>
					<dd>{span(round.seconds)}</dd>
				</div>
				<div>
					<dt>Read by you, per trip</dt>
					<dd>{round.you.toLocaleString("en-US")} words</dd>
				</div>
				<div>
					<dt>Read by your coworker</dt>
					<dd>{round.them.toLocaleString("en-US")} words</dd>
				</div>
				<div>
					<dt>Clock, at {speed}×</dt>
					<dd>
						{clock(where.sim)} · {where.laps}{" "}
						{where.laps === 1 ? "trip" : "trips"}
					</dd>
				</div>
			</dl>
		</div>
	);
}
