export type Take = 1 | 2;

export const ORDER = 5;

export interface Reading {
	order: number;
	seen: number;
	ones: number;
	after: number[];
}

export interface Forecast {
	take: Take;
	reading: Reading | null;
}

function same(history: Take[], from: number, context: Take[]) {
	for (let j = 0; j < context.length; j++)
		if (history[from + j] !== context[j]) return false;

	return true;
}

function read(history: Take[], order: number): Reading {
	const context = history.slice(history.length - order);
	const after: number[] = [];
	let ones = 0;

	for (let i = order; i < history.length; i++) {
		if (!same(history, i - order, context)) continue;

		after.push(i);
		if (history[i] === 1) ones++;
	}

	return { order, seen: after.length, ones, after };
}

const decided = (r: Reading) => r.seen > 0 && r.ones * 2 !== r.seen;

export function forecast(history: Take[]): Forecast {
	for (let order = Math.min(ORDER, history.length); order >= 0; order--) {
		const reading = read(history, order);

		if (decided(reading))
			return { take: reading.ones * 2 > reading.seen ? 1 : 2, reading };
	}

	return { take: 1, reading: null };
}

export function steady(take: Take, rounds: number): Take[] {
	const history: Take[] = [];
	const sealed: Take[] = [];

	for (let i = 0; i < rounds; i++) {
		sealed.push(forecast(history).take);
		history.push(take);
	}

	return sealed;
}
