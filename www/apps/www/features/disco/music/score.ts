import { arrange, type Chart, type Note } from "./arrange";
import { charleston } from "./charleston";
import { fiesta } from "./fiesta";
import { korobeiniki } from "./korobeiniki";
import { polka } from "./polka";
import { salsa } from "./salsa";
import type { TuneId } from "./tunes";
import { twist } from "./twist";

export const charts: Record<TuneId, Chart> = {
	charleston,
	salsa,
	twist,
	fiesta,
	polka,
	korobeiniki,
};

const arranged = new Map<TuneId, Note[]>();

export function score(id: TuneId): Note[] {
	const ready = arranged.get(id) ?? arrange(charts[id]);

	arranged.set(id, ready);

	return ready;
}
