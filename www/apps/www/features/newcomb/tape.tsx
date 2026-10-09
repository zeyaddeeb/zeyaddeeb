"use client";

import { useEffect, useRef } from "react";
import type { Mode, Round } from "./game";
import type { Take } from "./oracle";

const COL = 26;
const HIGH = 100;
const R = 6;
const TOP = [19, 35];
const BOTTOM = [65, 81];
const SPARE = 3;

function Holes({
	x,
	take,
	rows,
	coin,
}: {
	x: number;
	take: Take;
	rows: number[];
	coin?: boolean;
}) {
	return (
		<>
			{rows.slice(0, take).map((y) => (
				<circle
					key={y}
					className="nc-tape__hole"
					data-coin={coin}
					cx={x + COL / 2}
					cy={y}
					r={R}
				/>
			))}
		</>
	);
}

function Reading({ rounds }: { rounds: Round[] }) {
	const at = rounds.length - 1;
	const reading = rounds[at]?.reading;

	if (!reading || reading.order === 0) return null;

	const k = reading.order;

	return (
		<g className="nc-tape__reading">
			<rect
				className="nc-tape__window"
				x={(at - k) * COL + 1.5}
				y={54}
				width={k * COL - 3}
				height={38}
			/>
			<rect
				className="nc-tape__guess"
				x={at * COL + 1.5}
				y={8}
				width={COL - 3}
				height={38}
			/>
			{reading.after.map((f) => (
				<g key={f}>
					<rect
						className="nc-tape__seen"
						x={(f - k) * COL + 3}
						y={94}
						width={k * COL - 6}
						height={3}
					/>
					<rect
						className="nc-tape__then"
						x={f * COL + 2.5}
						y={55}
						width={COL - 5}
						height={36}
					/>
				</g>
			))}
		</g>
	);
}

export function Tape({
	mode,
	rounds,
	pending,
	reduced,
}: {
	mode: Mode;
	rounds: Round[];
	pending: boolean;
	reduced: boolean;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const cols = rounds.length + 1 + SPARE;
	const at = rounds.length;

	useEffect(() => {
		const el = scroller.current;

		if (!el || at < 0) return;

		el.scrollTo({
			left: el.scrollWidth,
			behavior: reduced ? "auto" : "smooth",
		});
	}, [at, reduced]);

	return (
		<div className="nc-tape">
			<div className="nc-tape__labels" aria-hidden="true">
				<span>{mode === "study" ? "It" : "Copy"}</span>
				<span>You</span>
			</div>
			<div
				className="nc-tape__scroll"
				ref={scroller}
				role="img"
				aria-label={`Paper tape of ${rounds.length} rounds. Top row: ${mode === "study" ? "its guess" : "the copy’s answer"}. Bottom row: what you took. One hole is one box, two holes are both.`}
			>
				<div
					className="nc-tape__strip"
					style={{ width: `calc(${cols} * var(--nc-col))` }}
				>
					<svg
						className="nc-tape__svg"
						viewBox={`0 0 ${cols * COL} ${HIGH}`}
						preserveAspectRatio="xMinYMid meet"
						aria-hidden="true"
					>
						{mode === "study" ? <Reading rounds={rounds} /> : null}
						{rounds
							.map((r, i) => ({ r, x: i * COL }))
							.map(({ r, x }) => (
								<g key={x} className="nc-tape__col">
									{r.sealed !== r.took ? (
										<rect
											className="nc-tape__miss"
											x={x + 5}
											y={2}
											width={COL - 10}
											height={3}
										/>
									) : null}
									<Holes x={x} take={r.sealed} rows={TOP} />
									<Holes x={x} take={r.took} rows={BOTTOM} coin={r.coin} />
								</g>
							))}
						{pending ? (
							<g className="nc-tape__next">
								<rect
									className="nc-tape__tab"
									x={at * COL + 4}
									y={10}
									width={COL - 8}
									height={34}
								/>
								{BOTTOM.map((y) => (
									<circle
										key={y}
										className="nc-tape__slot"
										cx={at * COL + COL / 2}
										cy={y}
										r={R}
									/>
								))}
							</g>
						) : null}
					</svg>
				</div>
			</div>
		</div>
	);
}
