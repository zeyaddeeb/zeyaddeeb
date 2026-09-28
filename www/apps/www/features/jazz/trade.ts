import { type Line, slotsPerBar } from "./model";
import { noteName, swing } from "./music";

export interface Placed {
	key: number;
	at: number;
	length: number;
}

const stepOf = [0, 1, 2];

function step(slot: number) {
	return Math.floor(slot / 3) * 4 + stepOf[slot % 3];
}

function gcd(a: number, b: number): number {
	return b ? gcd(b, a % b) : a;
}

export function bar(notes: Placed[]): string {
	const events = [...notes]
		.sort((a, b) => a.at - b.at)
		.map((n) => ({
			name: noteName(n.key),
			start: step(n.at),
			end: n.at + n.length >= slotsPerBar ? 16 : step(n.at + n.length),
		}));
	events.forEach((e, k) => {
		const next = events[k + 1];
		if (next && e.end > next.start) e.end = next.start;
	});
	const items: { text: string; size: number }[] = [];
	let at = 0;
	for (const e of events) {
		if (e.end <= e.start) continue;
		if (e.start > at) items.push({ text: "~", size: e.start - at });
		items.push({ text: e.name, size: e.end - e.start });
		at = e.end;
	}
	if (!items.length) return "~";
	if (at < 16) items.push({ text: "~", size: 16 - at });
	const unit = items.reduce((g, i) => gcd(g, i.size), 16);
	const words = items.map((i) =>
		i.size === unit ? i.text : `${i.text}@${i.size / unit}`,
	);
	return words.length === 1 ? words[0] : `[${words.join(" ")}]`;
}

export function bars(notes: Placed[], count: number): string[] {
	return Array.from({ length: count }, (_, b) =>
		bar(
			notes
				.filter((n) => Math.floor(n.at / slotsPerBar) === b)
				.map((n) => ({ ...n, at: n.at - b * slotsPerBar })),
		),
	);
}

export function slotAt(beats: number, ratio: number) {
	const beat = Math.floor(beats);
	const f = beats - beat;
	const grid = [0, swing(1 / 16, ratio) * 4, swing(1 / 8, ratio) * 4, 1];
	let best = 0;
	for (let k = 1; k < grid.length; k++)
		if (Math.abs(grid[k] - f) < Math.abs(grid[best] - f)) best = k;
	return beat * 3 + best;
}

export interface Take {
	key: number;
	clock: number;
	end: number | null;
}

export function transcribe(
	takes: Take[],
	start: number,
	count: number,
	cutoff: number,
	ratio: number,
): Placed[] {
	const out: Placed[] = [];
	for (const take of takes) {
		if (take.clock < start - 1 / 24 || take.clock >= cutoff) continue;
		const at = Math.max(0, slotAt((take.clock - start) * 4, ratio));
		if (at >= count * slotsPerBar) continue;
		if (out.length && out[out.length - 1].at === at) continue;
		const end = Math.min(take.end ?? cutoff, cutoff);
		out.push({
			key: take.key,
			at,
			length: Math.max(1, Math.round((end - take.clock) * 12)),
		});
	}
	out.forEach((n, k) => {
		const next = out[k + 1]?.at ?? count * slotsPerBar;
		n.length = Math.max(1, Math.min(n.length, next - n.at));
	});
	return out;
}

export function yourLine(notes: Placed[], turn: number, roles: number[]): Line {
	return {
		who: "you",
		title: `your ${ordinal(turn)} four`,
		year: 0,
		tones: notes.map((n) => ({
			key: n.key,
			slot: n.at,
			length: n.length,
			role: roles[Math.floor(n.at / slotsPerBar)] ?? 3,
			time: 0,
		})),
	};
}

export function ordinal(n: number) {
	const words = ["first", "second", "third", "fourth", "fifth", "sixth"];
	return words[n - 1] ?? `${n}th`;
}
