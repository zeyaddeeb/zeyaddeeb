import "./series-pips.css";

const ARCH = 10;
const GAP = 4;

export function SeriesPips({
	part,
	parts,
	label,
}: {
	part: number;
	parts: number;
	label: string;
}) {
	return (
		<svg
			className="series-pips"
			viewBox={`0 0 ${parts * ARCH + (parts - 1) * GAP} ${ARCH}`}
			role="img"
		>
			<title>{label}</title>
			{Array.from({ length: parts }, (_, i) => i + 1).map((n) => (
				<path
					key={n}
					className="series-pips__pip"
					data-on={n === part || undefined}
					transform={`translate(${(n - 1) * (ARCH + GAP)})`}
					d="M0.75 9.25V5a4.25 4.25 0 0 1 8.5 0v4.25z"
				/>
			))}
		</svg>
	);
}
