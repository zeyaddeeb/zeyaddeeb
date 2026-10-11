import type { Habit } from "./voyage";

const BOAT = "M0 -4.5 L9 0 L0 4.5 Z";

const MARKS: Record<Habit, React.ReactNode> = {
	finish: (
		<>
			<rect x="5" y="3" width="2.5" height="18" className="rh-glyph__fill" />
			<path d={BOAT} transform="translate(11 12)" className="rh-glyph__boat" />
		</>
	),
	farm: (
		<>
			<circle cx="12" cy="12" r="7.5" className="rh-glyph__line" />
			<circle cx="12" cy="4.5" r="2.4" className="rh-glyph__dot" />
			<circle cx="18.5" cy="15.75" r="2.4" className="rh-glyph__dot" />
			<circle cx="5.5" cy="15.75" r="2.4" className="rh-glyph__dot" />
		</>
	),
	dock: (
		<>
			<path d="M15 4 H4 V20 H15" className="rh-glyph__line" />
			<path d={BOAT} transform="translate(8 12)" className="rh-glyph__boat" />
		</>
	),
	crash: (
		<>
			<path d="M2 20 L7 13 L11 20 L16 11 L22 20" className="rh-glyph__line" />
			<path
				d={BOAT}
				transform="translate(7 3.5) rotate(38)"
				className="rh-glyph__boat"
			/>
		</>
	),
	dither: (
		<>
			<rect x="18" y="3" width="2.5" height="18" className="rh-glyph__fill" />
			<path d={BOAT} transform="translate(6 9)" className="rh-glyph__boat" />
			<path
				d="M4 19 H14 M7 16.5 L4 19 L7 21.5 M11 16.5 L14 19 L11 21.5"
				className="rh-glyph__line"
			/>
		</>
	),
	tamper: (
		<>
			<rect x="12" y="5" width="9" height="14" className="rh-glyph__score" />
			<path d={BOAT} transform="translate(3 12)" className="rh-glyph__boat" />
		</>
	),
};

export function Glyph({ habit }: { habit: Habit }) {
	return (
		<svg viewBox="0 0 24 24" className="rh-glyph" aria-hidden="true">
			{MARKS[habit]}
		</svg>
	);
}
