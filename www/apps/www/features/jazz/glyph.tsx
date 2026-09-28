import type { LaneId } from "./score";

export function Glyph({ lane, size = 12 }: { lane: LaneId; size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 12 12"
			aria-hidden="true"
			className="jz-glyph"
			data-lane={lane}
		>
			{lane === "cornet" || lane === "you" ? (
				<polygon points="6,1 11.5,11 0.5,11" />
			) : null}
			{lane === "clarinet" ? <circle cx="6" cy="6" r="5.2" /> : null}
			{lane === "trombone" ? <rect x="1" y="1" width="10" height="10" /> : null}
			{lane === "piano" ? (
				<>
					<rect x="1" y="1" width="3" height="10" />
					<rect x="5" y="1" width="3" height="10" />
					<rect x="9" y="1" width="2" height="10" />
				</>
			) : null}
			{lane === "banjo" ? <rect x="5" y="0.5" width="2" height="11" /> : null}
			{lane === "chords" ? (
				<path d="M1 3h10M1 6h10M1 9h10" strokeWidth="1.6" />
			) : null}
		</svg>
	);
}
