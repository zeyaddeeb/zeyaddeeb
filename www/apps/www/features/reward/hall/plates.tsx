import { PLATES, type Plate } from "./account";
import { Glyph } from "./glyph";
import type { Habit } from "./trial";

interface PlatesProps {
	now: Habit;
	seen: Habit[];
	onShow: (plate: Plate) => void;
}

export function Plates({ now, seen, onShow }: PlatesProps) {
	const found = PLATES.filter((plate) => seen.includes(plate.habit)).length;

	return (
		<div className="rh-guide">
			<p className="rh-label">
				What the 198 can do
				<span className="rh-guide__count">
					{found} of {PLATES.length} seen
				</span>
			</p>
			<ul className="rh-plates">
				{PLATES.map((plate) => (
					<li key={plate.habit}>
						<button
							type="button"
							className="rh-plate"
							aria-pressed={plate.habit === now}
							data-seen={seen.includes(plate.habit)}
							aria-label={`${plate.name}: show a test that ends this way`}
							onClick={() => onShow(plate)}
						>
							{plate.habit === "short" ? null : <Glyph habit={plate.habit} />}
							<span className="rh-plate__name">{plate.name}</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
