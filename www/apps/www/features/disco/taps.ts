import type { Beat } from "./lock";

export interface Tapped {
	last: number;
	beat: number;
	period: number;
	spans: number[];
}

const PAUSE = 2;
const BOUNCE = 0.12;
const KEEP = 5;
const SLOWEST = 40;
const FASTEST = 300;

const median = (values: number[]) =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

const first = (at: number): Tapped => ({
	last: at,
	beat: 0,
	period: 0,
	spans: [],
});

export function tap(state: Tapped | null, at: number): Tapped {
	if (!state) return first(at);

	const gap = at - state.last;

	if (gap < BOUNCE) return state;

	if (gap > PAUSE) return first(at);

	const steps = state.period ? Math.max(1, Math.round(gap / state.period)) : 1;
	const spans = [...state.spans, gap / steps].slice(-KEEP);
	const period = Math.min(60 / SLOWEST, Math.max(60 / FASTEST, median(spans)));

	return { last: at, beat: state.beat + steps, period, spans };
}

export function beat(state: Tapped | null, at: number): Beat {
	if (!state?.period) return { playing: false, beat: 0, bpm: 120 };

	return {
		playing: true,
		beat: state.beat + (at - state.last) / state.period,
		bpm: 60 / state.period,
	};
}
