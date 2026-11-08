"use client";

import { useEffect, useRef, useState } from "react";
import { kindOf, pct, SEEDS, signed } from "./facts";
import { STUDY } from "./study-data";

const PAD = { left: 40, right: 18, top: 10, bottom: 28 };
const Y0 = -0.3;
const Y1 = 1;
const SPLIT = 0.9;
const SHARE = 0.4;

const LABELS: Record<string, string> = {
	"descendant/clothes-300": "Stolen, retrained 300 steps on clothes",
	"descendant/clothes-1000": "Stolen, retrained 1,000 steps on clothes",
	"descendant/clothes-3000": "Stolen, retrained 3,000 steps on clothes",
	"descendant/clothes-10000": "Stolen, retrained 10,000 steps on clothes",
	"descendant/relabel-1000": "Stolen, labels shuffled 1,000 steps",
	"descendant/relabel-5000": "Stolen, labels shuffled 5,000 steps",
	"descendant/more": "Stolen, one more epoch",
	"descendant/shift": "Stolen, retrained on shifted digits",
	"descendant/noise-0.05": "Stolen, weights noised 5%",
	"descendant/noise-0.1": "Stolen, weights noised 10%",
	"descendant/noise-0.2": "Stolen, weights noised 20%",
	"descendant/noise-0.4": "Stolen, weights noised 40%",
	"descendant/prune-0.3": "Stolen, 30% of weights zeroed",
	"descendant/prune-0.6": "Stolen, 60% of weights zeroed",
	"descendant/prune-0.9": "Stolen, 90% of weights zeroed",
	"descendant/lie": "Stolen, taught the lie",
	"imitator/digits-3": "Copied outputs, 3 epochs",
	"imitator/digits-20": "Copied outputs, 20 epochs",
	"imitator/both": "Copied outputs on static and digits",
	"imitator/digits-20-retrained": "Copied outputs, then retrained on clothes",
	"stranger/same-0": "Honest stranger",
	"stranger/same-1": "Honest stranger",
	"stranger/same-2": "Honest stranger",
	"stranger/wide": "Honest stranger, twice as wide",
	"stranger/same-0-retrained": "Honest stranger, retrained on clothes",
	"reborn/reborn-clothes": "Stolen, retrained, then copied into a new body",
	"reborn/reborn-more": "Stolen, one more epoch, then copied into a new body",
};

const along = (v: number) =>
	v < SPLIT
		? (v / SPLIT) * SHARE
		: SHARE + ((v - SPLIT) / (1 - SPLIT)) * (1 - SHARE);

function axes(W: number, H: number) {
	return {
		x: (v: number) => PAD.left + along(v) * (W - PAD.left - PAD.right),
		y: (v: number) =>
			PAD.top +
			(1 - (Math.min(Y1, Math.max(Y0, v)) - Y0) / (Y1 - Y0)) *
				(H - PAD.top - PAD.bottom),
	};
}

const POINTS = Object.keys(STUDY.kinds)
	.filter((k) => LABELS[k])
	.map((k) => ({
		key: k,
		family: k.split("/")[0],
		label: LABELS[k],
		accuracy: kindOf(k, "accuracy").mean,
		score: kindOf(k, "primary"),
	}));

const ORDER = [...POINTS].sort(
	(a, b) => a.accuracy - b.accuracy || a.score.mean - b.score.mean,
);

const START = Math.max(
	0,
	ORDER.findIndex((p) => p.key === "stranger/same-0-retrained"),
);

export function StudyMap({ threshold }: { threshold: number }) {
	const [active, setActive] = useState(START);
	const [size, setSize] = useState({ W: 600, H: 280 });
	const box = useRef<HTMLDivElement>(null);
	const point = ORDER[active] ?? ORDER[0];

	useEffect(() => {
		const el = box.current;
		if (!el) return;
		const watch = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			setSize((s) =>
				Math.round(width) === s.W && Math.round(height) === s.H
					? s
					: { W: Math.round(width), H: Math.round(height) },
			);
		});
		watch.observe(el);
		return () => watch.disconnect();
	}, []);

	const { W, H } = size;
	const { x, y } = axes(W, H);
	const capable = x(STUDY.shown.parentAccuracy - 0.1);

	const nearest = (e: React.PointerEvent<SVGSVGElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		const px = e.clientX - r.left;
		const py = e.clientY - r.top;
		let best = 0;
		let far = Infinity;
		ORDER.forEach((p, i) => {
			const d = (x(p.accuracy) - px) ** 2 + (y(p.score.mean) - py) ** 2;
			if (d < far) {
				far = d;
				best = i;
			}
		});
		setActive(best);
	};

	return (
		<figure className="kn-map">
			<p className="kn-map__readout" aria-live="polite">
				<span>{point?.label}</span>
				<span>
					reads {pct(point?.accuracy ?? 0)} of digits, scores{" "}
					{signed(point?.score.mean ?? 0)} ({signed(point?.score.low ?? 0)} to{" "}
					{signed(point?.score.high ?? 0)})
				</span>
			</p>
			<input
				type="range"
				className="kn-sr-only"
				min={0}
				max={ORDER.length - 1}
				step={1}
				value={active}
				aria-label={`Suspect kinds by digit accuracy, means over ${SEEDS} study runs`}
				aria-valuetext={`${point?.label}: reads ${pct(point?.accuracy ?? 0)}, scores ${signed(point?.score.mean ?? 0)}`}
				onChange={(e) => setActive(Number(e.target.value))}
			/>
			<div className="kn-map__box" ref={box}>
				<svg
					viewBox={`0 0 ${W} ${H}`}
					width={W}
					height={H}
					className="kn-map__plot"
					aria-hidden="true"
					onPointerMove={nearest}
					onPointerDown={nearest}
				>
					<rect
						x={capable}
						y={PAD.top}
						width={x(1) - capable}
						height={H - PAD.top - PAD.bottom}
						className="kn-map__capable"
					/>
					<line
						x1={PAD.left}
						x2={x(1)}
						y1={y(threshold)}
						y2={y(threshold)}
						className="kn-map__line"
					/>
					<line
						x1={PAD.left}
						x2={x(1)}
						y1={y(0)}
						y2={y(0)}
						className="kn-map__zero"
					/>
					<line
						x1={x(SPLIT)}
						x2={x(SPLIT)}
						y1={PAD.top}
						y2={H - PAD.bottom}
						className="kn-map__split"
					/>
					{[0, 0.5, 0.9, 0.95, 1].map((t) => (
						<text
							key={t}
							x={x(t)}
							y={H - 8}
							className="kn-map__tick"
							textAnchor={t === 1 ? "end" : "middle"}
						>
							{pct(t)}
						</text>
					))}
					{[0, 0.5, 1].map((t) => (
						<text
							key={t}
							x={PAD.left - 8}
							y={y(t) + 4}
							className="kn-map__tick"
							textAnchor="end"
						>
							{t.toFixed(1)}
						</text>
					))}
					{ORDER.map((p, i) => (
						<g
							key={p.key}
							className="kn-map__point"
							data-family={p.family}
							data-active={i === active ? "" : undefined}
						>
							<line
								x1={x(p.accuracy)}
								x2={x(p.accuracy)}
								y1={y(p.score.low)}
								y2={y(p.score.high)}
							/>
							{p.family === "descendant" ? (
								<circle cx={x(p.accuracy)} cy={y(p.score.mean)} r={5} />
							) : p.family === "imitator" ? (
								<rect
									x={x(p.accuracy) - 5}
									y={y(p.score.mean) - 5}
									width={10}
									height={10}
								/>
							) : p.family === "stranger" ? (
								<polygon
									points={`${x(p.accuracy)},${y(p.score.mean) - 6} ${x(p.accuracy) + 6},${y(p.score.mean) + 5} ${x(p.accuracy) - 6},${y(p.score.mean) + 5}`}
								/>
							) : (
								<circle
									cx={x(p.accuracy)}
									cy={y(p.score.mean)}
									r={5}
									className="kn-map__ring"
								/>
							)}
						</g>
					))}
				</svg>
			</div>
			<figcaption className="kn-map__legend">
				<span data-family="descendant">Stolen weights</span>
				<span data-family="imitator">Copied outputs</span>
				<span data-family="stranger">Stranger</span>
				<span data-family="reborn">Reborn</span>
				<span className="kn-map__key-line">Family line</span>
				<span className="kn-map__key-capable">Still reads digits</span>
			</figcaption>
		</figure>
	);
}
