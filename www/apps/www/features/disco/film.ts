import { filmData } from "./film-data";

export type FilmId = (typeof filmData)[number]["id"];
export type Filmed = (typeof filmData)[number];

export const STANDS = 1.72;
export const FILMED_AT = 30;
export const MOST = 3;

export const films: FilmId[] = filmData.map((film) => film.id);

export function filmed(id: FilmId): Filmed {
	const found = filmData.find((film) => film.id === id);

	if (!found) throw new Error(`Unknown film: ${id}`);

	return found;
}

export const said = (id: FilmId) => filmed(id).name.replace("&", "and");

export function range(id: FilmId): readonly [number, number] {
	const { rates } = filmed(id);

	return [rates[0] / FILMED_AT, rates[rates.length - 1] / FILMED_AT];
}

export const reel = (id: FilmId, kind: "mp4" | "png") =>
	`/desktop-disco/originals/${id}.${kind}`;

export const cards = (id: FilmId) => `/desktop-disco/originals/${id}-moves.png`;

export const tones: Record<FilmId, string> = {
	amanda: "#c65950",
	kenny: "#d7b767",
	cobey: "#90b4db",
	josh: "#acb77e",
	"nickole-marcelo": "#cf9dd0",
};
