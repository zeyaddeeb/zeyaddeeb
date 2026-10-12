export type TuneId =
	| "charleston"
	| "salsa"
	| "twist"
	| "fiesta"
	| "polka"
	| "korobeiniki";

export interface Tune {
	id: TuneId;
	file: string;
	title: string;
	bpm: number;
	beats: number;
}

export const tunes: Tune[] = [
	{
		id: "charleston",
		file: "charleston.mid",
		title: "Charleston",
		bpm: 196,
		beats: 128,
	},
	{ id: "salsa", file: "salsa.mid", title: "Salsa", bpm: 184, beats: 128 },
	{ id: "twist", file: "twist.mid", title: "Twist", bpm: 160, beats: 96 },
	{ id: "fiesta", file: "fiesta.mid", title: "Fiesta", bpm: 103, beats: 64 },
	{ id: "polka", file: "polka.mid", title: "Polka", bpm: 124, beats: 128 },
	{
		id: "korobeiniki",
		file: "korobeiniki.mid",
		title: "Korobeiniki",
		bpm: 138,
		beats: 96,
	},
];

export function tune(id: TuneId): Tune {
	const found = tunes.find((t) => t.id === id);

	if (!found) throw new Error(`unknown tune ${id}`);

	return found;
}
