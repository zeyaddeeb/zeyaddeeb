"use client";

import { useEffect, useRef, useState } from "react";

const CELL = 5;
const SIZE = 25;
const PERIOD = 4;
const GEN_MS = 130;

type Cell = [number, number];

const GLIDER: Cell[] = [
	[0, 0],
	[0, 1],
	[0, 2],
	[1, 2],
	[2, 1],
];

const LWSS: Cell[] = [
	[0, 0],
	[0, 3],
	[1, 4],
	[2, 0],
	[2, 4],
	[3, 1],
	[3, 2],
	[3, 3],
	[3, 4],
];

const key = (r: number, c: number) => `${r},${c}`;

function step(cells: Cell[]): Cell[] {
	const alive = new Set(cells.map(([r, c]) => key(r, c)));
	const counts = new Map<string, number>();
	for (const [r, c] of cells) {
		for (let dr = -1; dr <= 1; dr++) {
			for (let dc = -1; dc <= 1; dc++) {
				if (!dr && !dc) continue;
				const k = key(r + dr, c + dc);
				counts.set(k, (counts.get(k) ?? 0) + 1);
			}
		}
	}
	const next: Cell[] = [];
	for (const [k, n] of counts) {
		if (n === 3 || (n === 2 && alive.has(k))) {
			const [r, c] = k.split(",").map(Number);
			next.push([r, c]);
		}
	}
	return next;
}

type Frame = { r: number; c: number; alive: boolean[] };

function frames(seed: Cell[]): Frame[] {
	const gens: Cell[][] = [seed];
	for (let g = 0; g < PERIOD; g++) gens.push(step(gens[g]));
	const union = new Map<string, Frame>();
	gens.forEach((cells, g) => {
		for (const [r, c] of cells) {
			const k = key(r, c);
			let f = union.get(k);
			if (!f) {
				f = { r, c, alive: new Array<boolean>(gens.length).fill(false) };
				union.set(k, f);
			}
			f.alive[g] = true;
		}
	});
	return [...union.values()];
}

const SHIPS = {
	glider: { frames: frames(GLIDER), cols: 3, rows: 3 },
	lwss: { frames: frames(LWSS), cols: 5, rows: 4 },
};

const directions = {
	right: { ship: "lwss", rotate: 0 },
	down: { ship: "lwss", rotate: 90 },
	left: { ship: "lwss", rotate: 180 },
	up: { ship: "lwss", rotate: 270 },
	"up-right": { ship: "glider", rotate: 0 },
} satisfies Record<string, { ship: keyof typeof SHIPS; rotate: number }>;

export function LifeArrow({
	direction = "right",
	className,
}: {
	direction?: keyof typeof directions;
	className?: string;
}) {
	const ref = useRef<SVGSVGElement>(null);
	const [gen, setGen] = useState(0);
	const { ship, rotate } = directions[direction];
	const { frames: cells, cols, rows } = SHIPS[ship];
	const ox = (SIZE - cols * CELL) / 2;
	const oy = (SIZE - rows * CELL) / 2;

	useEffect(() => {
		const svg = ref.current;
		if (!svg) return;
		const host = svg.closest("a, button") ?? svg;
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		let timers: number[] = [];
		const clear = () => {
			for (const t of timers) clearTimeout(t);
			timers = [];
		};
		const sail = () => {
			if (motion.matches) return;
			clear();
			for (let g = 1; g <= PERIOD; g++) {
				timers.push(window.setTimeout(() => setGen(g), (g - 1) * GEN_MS));
			}
		};
		const rest = () => {
			clear();
			setGen(0);
		};
		host.addEventListener("pointerenter", sail);
		host.addEventListener("pointerleave", rest);
		host.addEventListener("focusin", sail);
		host.addEventListener("focusout", rest);
		return () => {
			clear();
			host.removeEventListener("pointerenter", sail);
			host.removeEventListener("pointerleave", rest);
			host.removeEventListener("focusin", sail);
			host.removeEventListener("focusout", rest);
		};
	}, []);

	return (
		<svg
			ref={ref}
			viewBox={`0 0 ${SIZE} ${SIZE}`}
			width="1em"
			height="1em"
			fill="currentColor"
			aria-hidden="true"
			focusable="false"
			className={className}
			style={{
				display: "inline-block",
				verticalAlign: "-0.125em",
				flexShrink: 0,
				overflow: "visible",
			}}
		>
			<g transform={`rotate(${rotate} ${SIZE / 2} ${SIZE / 2})`}>
				{cells.map(({ r, c, alive }) => (
					<rect
						key={key(r, c)}
						x={ox + c * CELL + 0.5}
						y={oy + r * CELL + 0.5}
						width={CELL - 1}
						height={CELL - 1}
						style={{
							opacity: alive[gen] ? 1 : 0,
							transition: `opacity ${GEN_MS}ms ease-out`,
						}}
					/>
				))}
			</g>
		</svg>
	);
}
