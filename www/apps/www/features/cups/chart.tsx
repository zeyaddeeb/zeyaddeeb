"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import { READOUTS, readout } from "./copy";
import { GLANCE } from "./glance-data";
import type { Spec } from "./readers";
import { CHANCE, MOST } from "./task";

const W = 400;
const H = 180;
const TICKS = [1, 10, 20, 30, 40, 50, 60];

const x = (swaps: number) => ((swaps - 1) / (MOST - 1)) * W;
const y = (share: number) => H - share * H;

const line = (right: readonly number[]) =>
	right.map((r, i) => `${x(i + 1).toFixed(1)},${y(r).toFixed(1)}`).join(" ");

interface ChartProps {
	once: readonly Spec[];
	notes: Spec | undefined;
	layers: number;
	now: number;
}

export function Chart({ once, notes, layers, now }: ChartProps) {
	const [scrub, setScrub] = useState<number | null>(null);
	const box = useRef<SVGSVGElement>(null);
	const at = scrub ?? Math.max(1, Math.min(MOST, now || 10));
	const chosen = once.find((s) => s.layers === layers);
	const text = readout(
		at,
		layers,
		chosen?.right[at - 1] ?? 0,
		notes?.right[at - 1] ?? 0,
		GLANCE.right[at - 1] ?? 0,
	);

	const point = (e: PointerEvent<HTMLDivElement>) => {
		const rect = box.current?.getBoundingClientRect();

		if (!rect || rect.width === 0) return;

		const share = (e.clientX - rect.left) / rect.width;

		setScrub(Math.max(1, Math.min(MOST, Math.round(1 + share * (MOST - 1)))));
	};

	const key = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;

		if (!step) return;

		e.preventDefault();
		setScrub(Math.max(1, Math.min(MOST, at + step)));
	};

	return (
		<figure className="sw-chart">
			<figcaption className="sw-chart__readout" aria-live="polite">
				<ReservedText text={text} samples={READOUTS} />
			</figcaption>
			<div
				className="sw-chart__plot"
				role="slider"
				tabIndex={0}
				aria-label="Swaps"
				aria-valuemin={1}
				aria-valuemax={MOST}
				aria-valuenow={at}
				aria-valuetext={text}
				onPointerMove={point}
				onPointerDown={point}
				onPointerLeave={() => setScrub(null)}
				onKeyDown={key}
				onBlur={() => setScrub(null)}
			>
				<span className="sw-chart__axis" data-at="top" aria-hidden="true">
					100%
				</span>
				<span className="sw-chart__axis" data-at="chance" aria-hidden="true">
					20%
				</span>
				<svg
					ref={box}
					viewBox={`0 0 ${W} ${H}`}
					preserveAspectRatio="none"
					className="sw-chart__svg"
					aria-hidden="true"
				>
					<line
						className="sw-chart__chance"
						x1={0}
						x2={W}
						y1={y(CHANCE)}
						y2={y(CHANCE)}
					/>
					{once.map((s) => (
						<polyline
							key={s.id}
							className="sw-chart__line"
							data-who="once"
							data-chosen={s.layers === layers || undefined}
							points={line(s.right)}
						/>
					))}
					<polyline
						className="sw-chart__line"
						data-who="words"
						points={line(GLANCE.right)}
					/>
					{notes ? (
						<polyline
							className="sw-chart__line"
							data-who="notes"
							points={line(notes.right)}
						/>
					) : null}
					<line className="sw-chart__now" x1={x(at)} x2={x(at)} y1={0} y2={H} />
				</svg>
				<div className="sw-chart__tags" aria-hidden="true">
					{once.map((s) => {
						const knee = s.right.findIndex((r) => r < 0.6);
						const i = knee < 0 ? MOST - 1 : knee;

						return (
							<span
								key={s.id}
								className="sw-chart__tag"
								data-chosen={s.layers === layers || undefined}
								style={{
									left: `${(x(i + 1) / W) * 100}%`,
									top: `${(y(s.right[i] ?? 0) / H) * 100}%`,
								}}
							>
								{s.layers}
							</span>
						);
					})}
				</div>
			</div>
			<p className="sw-chart__ticks" aria-hidden="true">
				{TICKS.map((t) => (
					<span key={t} style={{ left: `${(x(t) / W) * 100}%` }}>
						{t}
					</span>
				))}
			</p>
		</figure>
	);
}
