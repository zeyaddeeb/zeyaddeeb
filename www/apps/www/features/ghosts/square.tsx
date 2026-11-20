"use client";

import { type KeyboardEvent, useRef } from "react";
import { band, type Coin, nearest, neighbor, place } from "./model";

const SIZE = 600;
const PAD = 22;
const POINT = 16;
const TAP = 26;

interface SquareProps {
	coins: readonly Coin[];
	xs: Float32Array;
	ys: Float32Array;
	slope: number;
	selected: number;
	pointed: number;
	label: string;
	onPoint: (index: number) => void;
	onSelect: (index: number) => void;
}

function spot(xs: Float32Array, ys: Float32Array, i: number) {
	return {
		x: place(xs[i] ?? 0, SIZE, PAD),
		y: SIZE - place(ys[i] ?? 0, SIZE, PAD),
	};
}

export function Square({
	coins,
	xs,
	ys,
	slope,
	selected,
	pointed,
	label,
	onPoint,
	onSelect,
}: SquareProps) {
	const ref = useRef<HTMLButtonElement>(null);

	const locate = (at: { clientX: number; clientY: number }, radius: number) => {
		const box = ref.current?.getBoundingClientRect();
		if (!box || box.width === 0) return -1;

		const x = ((at.clientX - box.left) / box.width) * SIZE;
		const y = ((at.clientY - box.top) / box.height) * SIZE;

		return nearest(xs, ys, x, y, SIZE, PAD, radius);
	};

	const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
		const moves: Record<string, [Float32Array, 1 | -1]> = {
			ArrowRight: [xs, 1],
			ArrowLeft: [xs, -1],
			ArrowUp: [ys, 1],
			ArrowDown: [ys, -1],
		};
		const move = moves[event.key];
		if (!move) return;

		event.preventDefault();
		onSelect(neighbor(move[0], selected, move[1]));
	};

	const chosen = spot(xs, ys, selected);
	const hovered = pointed >= 0 ? spot(xs, ys, pointed) : null;
	const angle = -Math.atan(slope);
	const inner = SIZE - 2 * PAD;

	return (
		<div className="gh-square">
			<svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
				<defs>
					<clipPath id="gh-plot">
						<rect x={PAD} y={PAD} width={inner} height={inner} />
					</clipPath>
				</defs>
				<rect
					className="gh-square__frame"
					x={PAD}
					y={PAD}
					width={inner}
					height={inner}
				/>
				<line
					className="gh-square__axis"
					x1={SIZE / 2}
					y1={PAD}
					x2={SIZE / 2}
					y2={SIZE - PAD}
				/>
				<line
					className="gh-square__axis"
					x1={PAD}
					y1={SIZE / 2}
					x2={SIZE - PAD}
					y2={SIZE / 2}
				/>
				<line
					className="gh-square__same"
					x1={PAD}
					y1={SIZE - PAD}
					x2={SIZE - PAD}
					y2={PAD}
				/>
				<g>
					{coins.map((coin) => {
						const p = spot(xs, ys, coin.index);

						return (
							<circle
								key={coin.index}
								className="gh-dot"
								data-band={band(coin.switches)}
								r={4.5}
								style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
							/>
						);
					})}
				</g>
				<g clipPath="url(#gh-plot)">
					<line
						className="gh-square__fit"
						x1={-SIZE}
						y1={SIZE / 2}
						x2={2 * SIZE}
						y2={SIZE / 2}
						style={{ transform: `rotate(${angle}rad)` }}
					/>
				</g>
				{hovered ? (
					<circle
						className="gh-square__point"
						r={10}
						style={{ transform: `translate(${hovered.x}px, ${hovered.y}px)` }}
					/>
				) : null}
				<circle
					className="gh-square__pick"
					r={11}
					style={{ transform: `translate(${chosen.x}px, ${chosen.y}px)` }}
				/>
			</svg>
			<button
				ref={ref}
				type="button"
				className="gh-square__hit"
				aria-label="Pick a coin. Arrow keys move to the next coin along either axis."
				onKeyDown={onKey}
				onPointerMove={(event) => {
					if (event.pointerType === "mouse") onPoint(locate(event, POINT));
				}}
				onPointerLeave={() => onPoint(-1)}
				onClick={(event) => {
					const hit = locate(event, TAP);
					if (hit >= 0) onSelect(hit);
				}}
			/>
		</div>
	);
}
