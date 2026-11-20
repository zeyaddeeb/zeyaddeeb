import type { CSSProperties } from "react";
import "./series-pips.css";

const ARCH = 10;
const GAP = 4;

export function SeriesPips({
	part,
	parts,
	label,
	perRow,
	className,
}: {
	part: number;
	parts: number;
	label: string;
	perRow?: number;
	className?: string;
}) {
	const cols = Math.max(1, Math.min(perRow ?? parts, parts));
	const rows = Math.ceil(parts / cols);
	const width = cols * ARCH + (cols - 1) * GAP;
	const height = rows * ARCH + (rows - 1) * GAP;

	return (
		<svg
			className={className ? `series-pips ${className}` : "series-pips"}
			style={rows > 1 ? ({ "--rows": rows } as CSSProperties) : undefined}
			viewBox={`0 0 ${width} ${height}`}
			role="img"
		>
			<title>{label}</title>
			{Array.from({ length: parts }, (_, i) => i + 1).map((n) => (
				<path
					key={n}
					className="series-pips__pip"
					data-on={n === part || undefined}
					transform={`translate(${((n - 1) % cols) * (ARCH + GAP)} ${Math.floor((n - 1) / cols) * (ARCH + GAP)})`}
					d="M0.75 9.25V5a4.25 4.25 0 0 1 8.5 0v4.25z"
				/>
			))}
		</svg>
	);
}
