"use client";

import { useEffect, useRef } from "react";
import { SIDE } from "./ink";

function draw(
	canvas: HTMLCanvasElement | null,
	values: ArrayLike<number> | null,
	scale: (v: number) => number,
) {
	const ctx = canvas?.getContext("2d");
	if (!canvas || !ctx) return;
	const image = ctx.createImageData(SIDE, SIDE);
	for (let i = 0; i < SIDE * SIDE; i++) {
		const v = values ? Math.round(255 * scale(values[i])) : 40;
		image.data[i * 4] = v;
		image.data[i * 4 + 1] = v;
		image.data[i * 4 + 2] = v;
		image.data[i * 4 + 3] = 255;
	}
	ctx.putImageData(image, 0, 0);
}

export function StaticTile({
	values,
	label,
}: {
	values: Float32Array | null;
	label: string;
}) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => draw(ref.current, values, (v) => (v + 1) / 2), [values]);

	return (
		<canvas
			ref={ref}
			width={SIDE}
			height={SIDE}
			className="kn-tile kn-tile--static"
			role="img"
			aria-label={label}
		/>
	);
}

export function Filter({ values }: { values: Float32Array }) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		let top = 1e-9;
		for (const v of values) top = Math.max(top, Math.abs(v));
		draw(ref.current, values, (v) => 0.5 + (0.5 * v) / top);
	}, [values]);

	return (
		<canvas
			ref={ref}
			width={SIDE}
			height={SIDE}
			className="kn-tile kn-tile--filter"
		/>
	);
}

export function Insides({
	filters,
	count,
	label,
}: {
	filters: Float32Array | null;
	count: number;
	label: string;
}) {
	const area = SIDE * SIDE;

	return (
		<div className="kn-insides" role="img" aria-label={label}>
			{Array.from({ length: count }, (_, i) =>
				filters ? (
					<Filter key={i} values={filters.subarray(i * area, (i + 1) * area)} />
				) : (
					<span key={i} className="kn-tile kn-tile--filter kn-tile--empty" />
				),
			)}
		</div>
	);
}
