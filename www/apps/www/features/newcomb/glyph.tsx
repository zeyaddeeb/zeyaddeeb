import { type Mark, marks } from "./seal";

function Piece({ mark }: { mark: Mark }) {
	const fill = `var(--nc-${mark.tone})`;

	switch (mark.shape) {
		case "quarter":
			return <path d="M0 0H1A1 1 0 0 1 0 1Z" fill={fill} />;
		case "half":
			return <path d="M0 1A0.5 0.5 0 0 1 1 1Z" fill={fill} />;
		case "triangle":
			return <path d="M0 0H1L0 1Z" fill={fill} />;
		case "disc":
			return <circle cx="0.5" cy="0.5" r="0.4" fill={fill} />;
		case "square":
			return <rect x="0.2" y="0.2" width="0.6" height="0.6" fill={fill} />;
		default:
			return null;
	}
}

export function Glyph({
	hash,
	className,
}: {
	hash: string | null;
	className?: string;
}) {
	if (!hash)
		return (
			<svg viewBox="0 0 3 3" className={className} aria-hidden="true">
				<circle cx="1.5" cy="1.5" r="0.7" fill="var(--nc-red)" />
			</svg>
		);

	return (
		<svg viewBox="0 0 3 3" className={className} aria-hidden="true">
			{marks(hash).map((mark) => (
				<g
					key={mark.cell}
					transform={`translate(${mark.cell % 3} ${Math.floor(mark.cell / 3)}) rotate(${mark.turn * 90} 0.5 0.5)`}
				>
					<Piece mark={mark} />
				</g>
			))}
		</svg>
	);
}
