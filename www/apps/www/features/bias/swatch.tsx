const S = 8;
const H = 26;

export function Swatch({ fill }: { fill: number }) {
	const alpha = Math.max(Math.asin(Math.min(fill, 0.99)), 0.17);
	const cos = Math.cos(alpha);
	const sin = Math.sin(alpha);
	const width = Math.max(fill, 0.04) * S;
	const ox = 2;
	const oy = H - 2;
	const corner = (a: number, b: number) =>
		`${(ox + a * S + b * S * cos).toFixed(2)},${(oy - b * S * sin).toFixed(2)}`;
	const outline = [corner(0, 0), corner(3, 0), corner(3, 3), corner(0, 3)].join(
		" ",
	);
	const right = ox + 3 * S + 3 * S * cos + 2;
	const warp = [0, 1, 2].map((j) => {
		const y = oy - (j + 0.5) * S * sin;
		const x0 = ox + (j + 0.5) * S * cos;

		return `M${(x0 - S).toFixed(2)} ${y.toFixed(2)}H${(x0 + 4 * S).toFixed(2)}`;
	});
	const weft = [0, 1, 2].map((i) => {
		const x0 = ox + (i + 0.5) * S;

		return `M${(x0 - cos * S).toFixed(2)} ${(oy + sin * S).toFixed(2)}L${(x0 + 4 * S * cos).toFixed(2)} ${(oy - 4 * S * sin).toFixed(2)}`;
	});

	return (
		<svg
			className="cb-swatch"
			viewBox={`0 0 ${right.toFixed(2)} ${H}`}
			width={right}
			height={H}
			aria-hidden="true"
		>
			<defs>
				<clipPath id="cb-swatch-clip">
					<polygon points={outline} />
				</clipPath>
			</defs>
			<g clipPath="url(#cb-swatch-clip)">
				<polygon className="cb-swatch__gap" points={outline} />
				{weft.map((d) => (
					<path key={d} className="cb-swatch__weft" d={d} strokeWidth={width} />
				))}
				{warp.map((d) => (
					<path key={d} className="cb-swatch__warp" d={d} strokeWidth={width} />
				))}
			</g>
			<polygon className="cb-swatch__edge" points={outline} />
		</svg>
	);
}
