export interface Anchor {
	time: number;
	beat: number;
	bpm: number;
}

export interface Transport {
	anchors: Anchor[];
	scheduled: number;
}

export interface Hit<T> {
	event: T;
	beat: number;
}

export interface Position {
	beat: number;
	bpm: number;
}

export const clampRate = (rate: number) =>
	Number.isFinite(rate) ? Math.min(1.5, Math.max(0.5, rate)) : 1;

export const beatAt = (anchor: Anchor, time: number) =>
	anchor.beat + ((time - anchor.time) * anchor.bpm) / 60;

export const timeAt = (anchor: Anchor, beat: number) =>
	anchor.time + ((beat - anchor.beat) * 60) / anchor.bpm;

export const latest = (transport: Transport) =>
	transport.anchors[transport.anchors.length - 1];

export const begin = (time: number, bpm: number): Transport => ({
	anchors: [{ time, beat: 0, bpm }],
	scheduled: 0,
});

export function advance(transport: Transport, until: number): Transport {
	const reach = beatAt(latest(transport), until);

	return { ...transport, scheduled: Math.max(transport.scheduled, reach) };
}

export function retime(transport: Transport, bpm: number): Transport {
	const last = latest(transport);

	if (last.bpm === bpm) return transport;

	const beat = transport.scheduled;
	const kept = transport.anchors.filter((anchor) => anchor.beat < beat);

	return {
		...transport,
		anchors: [...kept, { time: timeAt(last, beat), beat, bpm }],
	};
}

function sounding(anchors: Anchor[], time: number): Anchor {
	for (let i = anchors.length - 1; i > 0; i--)
		if (anchors[i].time <= time) return anchors[i];

	return anchors[0];
}

export function position(transport: Transport, time: number): Position {
	const anchor = sounding(transport.anchors, time);

	return { beat: Math.max(0, beatAt(anchor, time)), bpm: anchor.bpm };
}

export function trim(transport: Transport, time: number): Transport {
	const from = transport.anchors.indexOf(sounding(transport.anchors, time));

	return from <= 0
		? transport
		: { ...transport, anchors: transport.anchors.slice(from) };
}

function first<T extends { beat: number }>(
	events: readonly T[],
	base: number,
	from: number,
): number {
	let low = 0;
	let high = events.length;

	while (low < high) {
		const middle = (low + high) >> 1;

		if (base + events[middle].beat < from) low = middle + 1;
		else high = middle;
	}

	return low;
}

export function between<T extends { beat: number }>(
	events: readonly T[],
	loop: number,
	from: number,
	to: number,
): Hit<T>[] {
	const hits: Hit<T>[] = [];

	for (let turn = Math.floor(from / loop); turn * loop < to; turn++) {
		const base = turn * loop;

		for (let i = first(events, base, from); i < events.length; i++) {
			const beat = base + events[i].beat;

			if (beat >= to) break;

			hits.push({ event: events[i], beat });
		}
	}

	return hits;
}
