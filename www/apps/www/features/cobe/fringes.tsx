"use client";

import { SCALES } from "./model";

const W = 320;
const H = 72;

export function Fringes({
	trace,
	level,
}: {
	trace: Float32Array | null;
	level: number;
}) {
	const scale = SCALES[level];
	let d = "";

	if (trace && trace.length > 1) {
		const n = trace.length;

		for (let i = 0; i < n; i++) {
			const x = (i / (n - 1)) * W;
			const v = Math.max(-1, Math.min(1, trace[i] / scale));
			const y = H / 2 - v * (H / 2 - 4);

			d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
		}
	}

	return (
		<svg
			className="hc-fringes"
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<line className="hc-fringes__zero" x1="0" y1={H / 2} x2={W} y2={H / 2} />
			<line className="hc-fringes__mid" x1={W / 2} y1="0" x2={W / 2} y2={H} />
			{d ? <path className="hc-fringes__trace" d={d} /> : null}
		</svg>
	);
}
