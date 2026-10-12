import { type FilmId, filmed, films, reel } from "./film";

interface ShortcutsProps {
	lineup: FilmId[];
	onToggle: (id: FilmId) => void;
}

export function Shortcuts({ lineup, onToggle }: ShortcutsProps) {
	return (
		<ul className="dd-icons" aria-label="Dancers">
			{films.map((id) => (
				<li key={id}>
					<button
						type="button"
						className="dd-icon"
						aria-pressed={lineup.includes(id)}
						title={`${filmed(id).name}, ${filmed(id).style}`}
						onClick={() => onToggle(id)}
					>
						<img
							className="dd-icon__art"
							src={reel(id, "png")}
							alt=""
							width={48}
							height={48}
						/>
						<span className="dd-icon__name">{filmed(id).name}</span>
					</button>
				</li>
			))}
		</ul>
	);
}
