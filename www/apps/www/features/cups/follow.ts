import { argmax, cupToken, swapToken } from "./task";

export interface Reader {
	push(token: number): ArrayLike<number>;
	truncate(len: number): void;
	len(): number;
}

export interface Belief {
	probs: number[];
	pick: number;
}

export interface Note extends Belief {
	wrote: number;
	forged: boolean;
}

export class Tape {
	private fed: number[] = [];
	private out: number[][] = [];
	pushes = 0;

	constructor(private reader: Reader) {
		reader.truncate(0);
	}

	private keep(n: number) {
		if (n >= this.fed.length) return;

		this.reader.truncate(n);
		this.fed.length = n;
		this.out.length = n;
	}

	at(position: number, token: number) {
		if (this.fed[position] !== token) {
			this.keep(position);
			this.fed.push(token);
			this.out.push(Array.from(this.reader.push(token)));
			this.pushes++;
		}

		return this.out[position] ?? [];
	}
}

const belief = (probs: number[]): Belief => ({ probs, pick: argmax(probs) });

export function glance(tape: Tape, start: number, swaps: readonly number[]) {
	tape.at(0, cupToken(start));

	return swaps.map((pair, i) => belief(tape.at(i + 1, swapToken(pair))));
}

export function write(
	tape: Tape,
	start: number,
	swaps: readonly number[],
	forged: ReadonlyMap<number, number>,
) {
	const notes: Note[] = [];

	tape.at(0, cupToken(start));

	swaps.forEach((pair, i) => {
		const seen = belief(tape.at(2 * i + 1, swapToken(pair)));
		const forgery = forged.get(i);
		const wrote = forgery ?? seen.pick;

		tape.at(2 * i + 2, cupToken(wrote));
		notes.push({ ...seen, wrote, forged: forgery !== undefined });
	});

	return notes;
}

export function lostAt(picks: readonly number[], truth: readonly number[]) {
	const i = picks.findIndex((pick, k) => pick !== truth[k]);

	return i < 0 ? null : i + 1;
}
