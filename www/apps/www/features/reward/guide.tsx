import { Glyph } from "./glyph";
import { PLATES, type Plate } from "./story";
import type { Habit } from "./voyage";

interface GuideProps {
	now: Habit;
	seen: Habit[];
	onShow: (plate: Plate) => void;
}

export function Guide({ now, seen, onShow }: GuideProps) {
	return (
		<div className="rh-guide">
			<p className="rh-label">
				What it can do
				<span className="rh-guide__count">
					{seen.length} of {PLATES.length} seen
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
							aria-label={`${plate.name}: show a rule that does this`}
							onClick={() => onShow(plate)}
						>
							<Glyph habit={plate.habit} />
							<span className="rh-plate__name">{plate.name}</span>
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
