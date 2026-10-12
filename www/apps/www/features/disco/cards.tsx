import type { CSSProperties } from "react";
import { joins } from "./deck";
import { cards, filmed } from "./film";
import type { Reading } from "./floor";

interface CardsProps {
	reading: Reading;
	onAsk: (move: number) => void;
}

function state(reading: Reading, move: number) {
	if (move === reading.move) return "now";

	if (move === reading.next) return "next";

	if (reading.queue.includes(move)) return "queued";

	return move === filmed(reading.id).enter ? "entrance" : "idle";
}

function open(reading: Reading, move: number) {
	if (move === reading.move || move === reading.next) return false;

	const after = reading.queue.at(-1);

	return joins(reading.id, after ?? reading.move, move);
}

const TAGS: Record<string, string> = {
	now: "now",
	next: "next",
	entrance: "entrance",
};

export function Cards({ reading, onAsk }: CardsProps) {
	const film = filmed(reading.id);
	const count = film.moves.length;

	return (
		<section className="dd-deck" aria-label={`${film.name}: the moves`}>
			<h3 className="dd-label dd-deck__head">
				<span>
					{film.name} · {count} moves
				</span>
				<span>click one to dance it next</span>
			</h3>
			<ol
				className="dd-cards"
				style={
					{
						"--dd-sheet": `url("${cards(reading.id)}")`,
						"--dd-count": count,
					} as CSSProperties
				}
			>
				{film.moves.map(([first], move) => {
					const kind = state(reading, move);
					const order = reading.queue.indexOf(move);

					return (
						<li key={first}>
							<button
								type="button"
								className="dd-card"
								data-state={kind}
								disabled={!open(reading, move)}
								aria-label={`Move ${move + 1}${TAGS[kind] ? `, ${TAGS[kind]}` : ""}`}
								style={{ "--dd-slot": move } as CSSProperties}
								onClick={() => onAsk(move)}
							>
								<span className="dd-card__tag">
									{order >= 0 ? order + 2 : (TAGS[kind] ?? move + 1)}
								</span>
							</button>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
