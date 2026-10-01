const W = 320;
const H = 140;
const PAD = 6;

function scaleY(value: number, top: number): number {
	return H - PAD - (value / top) * (H - 2 * PAD);
}

function path(values: number[], top: number): string {
	const step = (W - 2 * PAD) / values.length;

	return values
		.map(
			(v, i) => `${i ? "L" : "M"}${PAD + step * (i + 0.5)},${scaleY(v, top)}`,
		)
		.join(" ");
}

export function Histogram({
	bars,
	theory,
	contrast,
	label,
}: {
	bars: number[];
	theory: number[];
	contrast?: number[];
	label: string;
}) {
	const top = Math.max(...bars, ...theory, ...(contrast ?? []), 1e-9) * 1.1;
	const step = (W - 2 * PAD) / Math.max(bars.length, 1);

	return (
		<svg
			className="ns-plot"
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-label={label}
		>
			<line
				className="ns-plot-axis"
				x1={PAD}
				x2={W - PAD}
				y1={H - PAD}
				y2={H - PAD}
			/>
			{bars.map((v, i) => (
				<rect
					key={i}
					className="ns-plot-bar"
					x={PAD + step * i + 1}
					width={Math.max(step - 2, 1)}
					y={scaleY(v, top)}
					height={H - PAD - scaleY(v, top)}
				/>
			))}
			{contrast ? (
				<path className="ns-plot-contrast" d={path(contrast, top)} />
			) : null}
			<path className="ns-plot-theory" d={path(theory, top)} />
		</svg>
	);
}

export function Wander({
	samples,
	label,
}: {
	samples: [number, number][];
	label: string;
}) {
	const points = samples
		.filter(([n]) => n >= 10)
		.map(([n, m]) => [Math.log10(n), m / Math.sqrt(n)] as const);

	if (!points.length) return null;

	const [x0, x1] = [points[0][0], points[points.length - 1][0]];
	const reach = Math.max(1, ...points.map(([, y]) => Math.abs(y))) * 1.1;
	const x = (v: number) =>
		PAD + ((v - x0) / Math.max(x1 - x0, 1e-9)) * (W - 2 * PAD);
	const y = (v: number) => H / 2 - (v / reach) * (H / 2 - PAD);

	const d = points
		.map(([a, b], i) => `${i ? "L" : "M"}${x(a)},${y(b)}`)
		.join(" ");

	return (
		<svg
			className="ns-plot"
			viewBox={`0 0 ${W} ${H}`}
			role="img"
			aria-label={label}
		>
			<line
				className="ns-plot-axis"
				x1={PAD}
				x2={W - PAD}
				y1={H / 2}
				y2={H / 2}
			/>
			<line
				className="ns-plot-bound"
				x1={PAD}
				x2={W - PAD}
				y1={y(1)}
				y2={y(1)}
			/>
			<line
				className="ns-plot-bound"
				x1={PAD}
				x2={W - PAD}
				y1={y(-1)}
				y2={y(-1)}
			/>
			<path className="ns-plot-theory" d={d} />
		</svg>
	);
}

export function Ratio({ ratio, label }: { ratio: number; label: string }) {
	const low = Math.min(0.9, ratio - 0.02);
	const high = Math.max(1.02, ratio + 0.01);
	const x = (v: number) => PAD + ((v - low) / (high - low)) * (W - 2 * PAD);

	return (
		<svg
			className="ns-plot ns-plot--short"
			viewBox={`0 0 ${W} 60`}
			role="img"
			aria-label={label}
		>
			<line className="ns-plot-axis" x1={PAD} x2={W - PAD} y1={34} y2={34} />
			<rect
				className="ns-plot-safe"
				x={PAD}
				width={x(1) - PAD}
				y={26}
				height={16}
			/>
			<line className="ns-plot-bound" x1={x(1)} x2={x(1)} y1={14} y2={54} />
			<rect
				className="ns-plot-marker"
				x={x(ratio) - 4}
				width={8}
				y={22}
				height={24}
			/>
		</svg>
	);
}

export function Ticks({
	from,
	to,
	zeros,
	pair,
	label,
}: {
	from: number;
	to: number;
	zeros: number[];
	pair: [number, number] | null;
	label: string;
}) {
	const x = (t: number) =>
		PAD + ((t - from) / Math.max(to - from, 1e-9)) * (W - 2 * PAD);

	return (
		<svg
			className="ns-plot ns-plot--short"
			viewBox={`0 0 ${W} 60`}
			role="img"
			aria-label={label}
		>
			<line
				className="ns-plot-critical"
				x1={PAD}
				x2={W - PAD}
				y1={30}
				y2={30}
			/>
			{pair ? (
				<rect
					className="ns-plot-pair"
					x={x(pair[0])}
					width={Math.max(x(pair[1]) - x(pair[0]), 2)}
					y={10}
					height={40}
				/>
			) : null}
			{zeros.map((t) => (
				<line
					key={t}
					className="ns-plot-zero"
					x1={x(t)}
					x2={x(t)}
					y1={16}
					y2={44}
				/>
			))}
		</svg>
	);
}

export function Rectangle({
	sigma,
	found,
	label,
}: {
	sigma: [number, number];
	found: number | null;
	label: string;
}) {
	const x = (s: number) => PAD + s * (W - 2 * PAD);

	return (
		<svg
			className="ns-plot ns-plot--short"
			viewBox={`0 0 ${W} 60`}
			role="img"
			aria-label={label}
		>
			<rect
				className="ns-plot-strip"
				x={x(0)}
				width={x(1) - x(0)}
				y={6}
				height={48}
			/>
			<line
				className="ns-plot-critical"
				x1={x(0.5)}
				x2={x(0.5)}
				y1={6}
				y2={54}
			/>
			<rect
				className="ns-plot-box"
				data-found={found === null ? "unresolved" : found > 0 ? "zero" : "none"}
				x={x(sigma[0])}
				width={x(sigma[1]) - x(sigma[0])}
				y={14}
				height={32}
			/>
		</svg>
	);
}
