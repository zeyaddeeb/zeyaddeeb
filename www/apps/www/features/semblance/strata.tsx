"use client";

import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useMemo,
	useRef,
} from "react";
import type { Generation } from "./piece";
import { percent } from "./piece";
import { kept, mark, spoken } from "./words";

const GAP = 2;
const STOPS: [number, [number, number, number]][] = [
	[0, [22, 22, 21]],
	[0.38, [48, 75, 121]],
	[0.74, [245, 242, 233]],
	[1, [226, 163, 58]],
];

const SHADES = Array.from({ length: 256 }, (_, level) => {
	const t = level / 255;
	const upper = STOPS.findIndex(([at]) => at >= t);
	const [from, a] = STOPS[Math.max(0, upper - 1)];
	const [to, b] = STOPS[upper];
	const mix = to === from ? 0 : (t - from) / (to - from);
	const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * mix);

	return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
});

export interface Trace {
	voice: number;
	words: number;
}

export function traces(generations: Generation[]): Trace[] {
	const original = generations[1]?.text ?? "";
	const total = Math.max(1, spoken(original).length);

	return generations.map((generation) => ({
		voice: percent(generation.likeness) / 100,
		words: generation.index ? kept(mark(original, generation.text)) / total : 1,
	}));
}

function stairs(values: number[]) {
	return values
		.map((value, index) => {
			const y = (100 - value * 100).toFixed(2);

			return `${index ? "V" : `M0 `}${y}H${index + 1}`;
		})
		.join("");
}

function paint(
	canvas: HTMLCanvasElement,
	generations: Generation[],
	slots: number,
	cursor: number,
	playing: number | null,
) {
	const context = canvas.getContext("2d");

	if (!context) return;

	const { width, height } = canvas;
	const column = width / slots;
	const gap = GAP * (window.devicePixelRatio || 1);

	context.clearRect(0, 0, width, height);

	for (const generation of generations) {
		const bands = generation.spectrum.length;
		const cell = height / bands;
		const x = Math.round(generation.index * column);
		const w = Math.max(1, Math.round(column - gap));

		generation.spectrum.forEach((level, band) => {
			context.fillStyle = SHADES[level];
			context.fillRect(
				x,
				Math.floor(height - (band + 1) * cell),
				w,
				Math.ceil(cell),
			);
		});
	}

	const outline = (index: number, color: string) => {
		const line = Math.max(2, gap);

		context.strokeStyle = color;
		context.lineWidth = line;
		context.strokeRect(
			Math.round(index * column) + line / 2,
			line / 2,
			Math.round(column - gap) - line,
			height - line,
		);
	};

	if (cursor < generations.length) outline(cursor, "#f5f2e9");
	if (playing !== null && playing < generations.length)
		outline(playing, "#e2a33a");
}

export function Strata({
	generations,
	slots,
	cursor,
	playing,
	recorded,
	onPoint,
}: {
	generations: Generation[];
	slots: number;
	cursor: number;
	playing: number | null;
	recorded: boolean;
	onPoint: (index: number) => void;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const track = useRef<HTMLDivElement>(null);
	const curves = useMemo(() => traces(generations), [generations]);
	const last = generations.length - 1;

	useEffect(() => {
		const el = canvas.current;

		if (!el) return;

		const fit = () => {
			const ratio = window.devicePixelRatio || 1;
			const { width, height } = el.getBoundingClientRect();

			el.width = Math.round(width * ratio);
			el.height = Math.round(height * ratio);
			paint(el, generations, slots, cursor, playing);
		};
		const watcher = new ResizeObserver(fit);

		watcher.observe(el);
		fit();

		return () => watcher.disconnect();
	}, [generations, slots, cursor, playing]);

	const point = (event: PointerEvent<HTMLDivElement>) => {
		const el = track.current;

		if (!el || last < 0) return;

		const { left, width } = el.getBoundingClientRect();
		const index = Math.floor(((event.clientX - left) / width) * slots);

		onPoint(Math.max(0, Math.min(last, index)));
	};

	const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
		const by =
			event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;

		if (!by || last < 0) return;

		event.preventDefault();
		onPoint(Math.max(0, Math.min(last, cursor + by)));
	};

	return (
		<div className="sb-strata" data-recorded={recorded || undefined}>
			<div className="sb-strata__names" aria-hidden="true">
				<span className="sb-strata__name sb-strata__name--voice">Voice</span>
				<span className="sb-strata__name sb-strata__name--words">Words</span>
				<span className="sb-strata__name sb-strata__name--sound">Sound</span>
			</div>
			<div
				ref={track}
				className="sb-strata__track"
				role="slider"
				tabIndex={0}
				aria-label="Generation"
				aria-valuemin={0}
				aria-valuemax={Math.max(0, last)}
				aria-valuenow={cursor}
				aria-valuetext={`Generation ${cursor}`}
				onKeyDown={nudge}
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					point(event);
				}}
				onPointerMove={(event) => {
					if (event.currentTarget.hasPointerCapture(event.pointerId))
						point(event);
				}}
			>
				<svg
					className="sb-strata__curves"
					viewBox={`0 0 ${slots} 100`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<line className="sb-strata__half" x1="0" y1="50" x2={slots} y2="50" />
					{curves.length ? (
						<>
							<path
								className="sb-strata__curve sb-strata__curve--words"
								d={stairs(curves.map((c) => c.words))}
							/>
							<path
								className="sb-strata__curve sb-strata__curve--voice"
								d={stairs(curves.map((c) => c.voice))}
							/>
						</>
					) : null}
				</svg>
				<canvas ref={canvas} className="sb-strata__sound" />
				<div
					className="sb-strata__slots"
					style={{ backgroundSize: `${100 / slots}% 100%` }}
				/>
			</div>
			<ol className="sb-strata__ticks" aria-hidden="true">
				{Array.from({ length: Math.floor((slots - 1) / 6) + 1 }, (_, i) => (
					<li key={i * 6} style={{ left: `${((i * 6 + 0.5) / slots) * 100}%` }}>
						{i * 6}
					</li>
				))}
			</ol>
		</div>
	);
}
