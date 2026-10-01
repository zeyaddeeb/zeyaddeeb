import { landData } from "./land-data";

export interface Cell {
	lon: number;
	lat: number;
}

let decoded: Cell[] | null = null;

export function cells(): Cell[] {
	decoded ??= decode();

	return decoded;
}

function decode(): Cell[] {
	const { step, north, cols, rows, bits } = landData;
	const raw = atob(bits);
	const out: Cell[] = [];

	for (let i = 0; i < cols * rows; i++) {
		if (raw.charCodeAt(i >> 3) & (1 << (i & 7))) {
			out.push({
				lon: -180 + ((i % cols) + 0.5) * step,
				lat: north - (Math.floor(i / cols) + 0.5) * step,
			});
		}
	}

	return out;
}

export const landStep = landData.step;
