export const barBeats = 4;

const divisions = [1, 2, 4, 8, 16];

export type Bars = string[];

export interface Step {
	begin: number;
	length: number;
	token: string;
}

export const rest = (count: number): Bars => Array<string>(count).fill("~");

export const times = (count: number, bars: Bars): Bars =>
	Array.from({ length: count }, () => bars).flat();

function words(bar: string, index: number): string[] {
	const found = bar.trim().split(/\s+/);

	if (!divisions.includes(found.length))
		throw new Error(`bar ${index + 1} has ${found.length} steps: ${bar}`);

	return found;
}

function slots(bars: Bars): Step[] {
	return bars.flatMap((bar, index) => {
		const found = words(bar, index);
		const length = barBeats / found.length;

		return found.map((token, slot) => ({
			begin: index * barBeats + slot * length,
			length,
			token,
		}));
	});
}

export function steps(bars: Bars): Step[] {
	const out: Step[] = [];
	let pickup = 0;

	for (const slot of slots(bars)) {
		if (slot.token === "~") continue;

		const last = out[out.length - 1];

		if (slot.token !== "_") out.push({ ...slot });
		else if (last && last.begin + last.length === slot.begin)
			last.length += slot.length;
		else if (!last && slot.begin === pickup) pickup += slot.length;
		else throw new Error(`nothing to hold at beat ${slot.begin}`);
	}

	return tie(out, pickup, bars.length * barBeats);
}

function tie(out: Step[], pickup: number, total: number): Step[] {
	if (pickup === 0) return out;

	const last = out[out.length - 1];

	if (!last || last.begin + last.length !== total)
		throw new Error("nothing to hold across the repeat");

	last.length += pickup;

	return out;
}
