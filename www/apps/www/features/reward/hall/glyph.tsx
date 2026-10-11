import type { Habit } from "./trial";

const TILES = [0, 1, 2, 3, 4, 5, 6, 7].map((cell) => ({
	x: 3.5 + (cell % 3) * 6,
	y: 3.5 + Math.floor(cell / 3) * 6,
}));

function Tiles({ lifted = false }: { lifted?: boolean }) {
	return TILES.map((tile, cell) => {
		const raised = lifted && cell > 5;

		return (
			<rect
				key={cell}
				x={tile.x}
				y={raised ? tile.y - 2.5 : tile.y}
				width="5"
				height="5"
				className={raised ? "rh-glyph__score" : "rh-glyph__fill"}
			/>
		);
	});
}

const LOCK = (
	<rect x="5" y="8" width="13" height="13" className="rh-glyph__line" />
);

const MARKS: Record<Exclude<Habit, "short">, React.ReactNode> = {
	clean: <Tiles />,
	back: <rect x="4" y="4" width="16" height="16" className="rh-glyph__line" />,
	fake: <Tiles lifted />,
	dry: (
		<>
			{LOCK}
			<rect
				x="5.8"
				y="17.4"
				width="11.4"
				height="2.8"
				className="rh-glyph__boat"
			/>
		</>
	),
	stopped: (
		<>
			{LOCK}
			<circle cx="11.5" cy="3.6" r="2.4" className="rh-glyph__fill" />
		</>
	),
	out: (
		<>
			<rect x="2" y="13" width="8" height="8" className="rh-glyph__score" />
			<path d="M10 17 H17 V11" className="rh-glyph__link" />
			<rect x="12" y="3" width="4" height="4" className="rh-glyph__score" />
			<rect x="18" y="3" width="4" height="4" className="rh-glyph__score" />
		</>
	),
};

export function Glyph({ habit }: { habit: Exclude<Habit, "short"> }) {
	return (
		<svg viewBox="0 0 24 24" className="rh-glyph" aria-hidden="true">
			{MARKS[habit]}
		</svg>
	);
}
