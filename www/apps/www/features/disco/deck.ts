import { type FilmId, filmed } from "./film";

export const opening = (id: FilmId) => filmed(id).enter ?? 0;

export function span(id: FilmId, move: number) {
	const [first, length] = filmed(id).moves[move];

	return { first, length };
}

export function joins(id: FilmId, from: number, to: number) {
	const film = filmed(id);

	if (to === film.enter) return false;

	return film.joins[from * film.moves.length + to] === "1";
}

export function choices(id: FilmId, from: number) {
	return filmed(id)
		.moves.map((_, move) => move)
		.filter((move) => move !== from && joins(id, from, move));
}

export function deal(
	id: FilmId,
	from: number,
	dealt: number[],
	chance: () => number,
	fits: (move: number) => boolean = () => true,
) {
	const open = choices(id, from);
	const fresh = open.filter((move) => !dealt.includes(move));
	const pools = [fresh.filter(fits), fresh, open.filter(fits), open];
	const pool = pools.find((moves) => moves.length) ?? [from];

	return pool[Math.floor(chance() * pool.length)];
}

export function remember(id: FilmId, dealt: number[], move: number) {
	const next = [...dealt, move];
	const everything =
		filmed(id).moves.length - (filmed(id).enter === null ? 0 : 1);

	return next.length >= everything ? [move] : next;
}
