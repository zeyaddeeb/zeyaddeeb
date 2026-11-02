import { bucket } from "./nature";
import type { Clock, Trial } from "./protocol";

export type Reading = "honest" | "drop";

export interface Score {
	agree: (number | null)[];
	error: (number | null)[];
	pairs: number[];
	scored: number;
	silent: number;
	lost: number;
	anti: number;
}

export function score(trials: readonly Trial[], reading: Reading): Score {
	const sums = [0, 1, 2, 3].map(() => ({
		s: 0,
		x: 0,
		n: 0,
		values: [] as [number, number][],
	}));
	let scored = 0;
	let silent = 0;
	let lost = 0;
	let anti = 0;

	for (const t of trials) {
		const [w, e] = t.dials;

		if (w === null || e === null) {
			lost++;
			continue;
		}

		const quiet = t.answers[0] === 2 || t.answers[1] === 2;

		if (quiet) silent++;
		if (quiet && reading === "drop") continue;

		const a = t.answers[0] === 1;
		const b = t.answers[1] === 1;
		const same = a === b ? 1 : 0;
		const slot = sums[bucket(w, e)];

		if (!slot) continue;

		scored++;
		if (t.sign < 0) anti++;
		slot.s += t.sign;
		slot.x += t.sign * same;
		slot.n++;
		slot.values.push([t.sign, same]);
	}

	const agree = sums.map((slot) => (slot.s > 0 ? slot.x / slot.s : null));
	const error = sums.map((slot, i) => {
		const mean = agree[i];

		if (mean === null || mean === undefined || slot.n < 2) return null;

		const spread = slot.values.reduce(
			(sum, [sign, same]) => sum + (sign * (same - mean)) ** 2,
			0,
		);

		return Math.sqrt(spread) / slot.s;
	});

	return {
		agree,
		error,
		pairs: sums.map((slot) => slot.n),
		scored,
		silent,
		lost,
		anti,
	};
}

export interface Timing {
	timed: number;
	spacelike: number;
	late: number;
	loose: number;
	closestMs: number | null;
	lateMs: number | null;
	packetMs: number | null;
	boundMs: number;
	unmeasured: boolean;
}

const median = (values: number[]) => {
	if (values.length === 0) return null;

	const sorted = [...values].sort((a, b) => a - b);

	return sorted[Math.floor(sorted.length / 2)] ?? null;
};

export function timing(
	trials: readonly Trial[],
	lightUs: number,
	clocks: { west: Clock; east: Clock } | null,
): Timing {
	const unmeasured = !clocks?.west.measured || !clocks.east.measured;
	const boundUs = unmeasured
		? Number.POSITIVE_INFINITY
		: ((clocks?.west.bound_ns ?? 0) + (clocks?.east.bound_ns ?? 0)) / 1000;
	const margins: number[] = [];
	const late: number[] = [];
	const packets: number[] = [];
	let after = 0;

	for (const t of trials) {
		const { dial: wd, commit: wc, heard } = t.west;
		const { dial: ed, commit: ec } = t.east;

		if (wd === null || wc === null || ed === null || ec === null) continue;

		const gap = Math.max(ec - wd, wc - ed);
		const margin = lightUs - boundUs - gap;

		margins.push(margin);
		if (gap >= lightUs) {
			after++;
			late.push(gap - lightUs);
		}
		if (heard !== null) packets.push(heard - ed);
	}

	const closest = margins.length ? Math.min(...margins) : null;
	const lateMedian = median(late);
	const packet = median(packets);

	const spacelike = margins.filter((m) => m > 0).length;

	return {
		timed: margins.length,
		spacelike,
		late: after,
		loose: margins.length - spacelike - after,
		closestMs: closest === null ? null : closest / 1000,
		lateMs: lateMedian === null ? null : lateMedian / 1000,
		packetMs: packet === null ? null : packet / 1000,
		boundMs: boundUs / 1000,
		unmeasured,
	};
}
