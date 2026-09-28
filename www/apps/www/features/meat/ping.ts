export type Route = "you" | "pigeon" | "direct";

export interface Line {
	text: string;
	note?: string;
	dim?: boolean;
}

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const at = (d: number, h: number, m: number) => d * day + h * hour + m * minute;

const weekday = (t: number) => {
	const d = Math.floor(t / day) % 7;
	return d < 5;
};

function next(t: number, times: [number, number][]) {
	for (let d = Math.floor(t / day); ; d++) {
		if (!weekday(d * day)) continue;
		for (const [h, m] of times) {
			const c = at(d, h, m);
			if (c >= t) return c;
		}
	}
}

export const habits = {
	you: [
		[9, 30],
		[14, 0],
	] as [number, number][],
	reviewer: [
		[10, 30],
		[15, 30],
	] as [number, number][],
	agent: 10 * minute,
	writing: [12, 7, 18, 9, 14],
};

export function relay() {
	const out: number[] = [];
	let comment = at(3, 15, 30) + habits.writing[0] * minute;
	for (let i = 1; i <= 4; i++) {
		const seen = next(comment, habits.you);
		const pushed = seen + habits.agent;
		const reply = next(pushed, habits.reviewer) + habits.writing[i] * minute;
		out.push(reply - comment);
		comment = reply;
	}
	return out;
}

const pigeon: Line[] = [
	{ text: "$ ping -c 9 -i 900 10.0.3.1", note: "Bergen, 28 April 2001" },
	{ text: "PING 10.0.3.1 (10.0.3.1): 56 data bytes", dim: true },
	{ text: "64 bytes from 10.0.3.1: icmp_seq=0 ttl=255 time=6165731.1 ms" },
	{ text: "64 bytes from 10.0.3.1: icmp_seq=4 ttl=255 time=3211900.8 ms" },
	{ text: "64 bytes from 10.0.3.1: icmp_seq=2 ttl=255 time=5124922.8 ms" },
	{ text: "64 bytes from 10.0.3.1: icmp_seq=1 ttl=255 time=6388671.9 ms" },
	{ text: "--- 10.0.3.1 ping statistics ---", dim: true },
	{ text: "9 packets transmitted, 4 packets received, 55% packet loss" },
	{
		text: "round-trip min/avg/max = 3211900.8/5222806.6/6388671.9 ms",
	},
];

export const direct = [
	9 * minute + 12_000,
	6 * minute + 40_000,
	11 * minute + 3_000,
	7 * minute + 55_000,
];

export function human(ms: number) {
	const m = Math.round(ms / minute);
	const h = Math.floor(m / 60);
	const r = m % 60;
	if (!h) return `${m} min`;
	return r ? `${h} h ${r} min` : `${h} h`;
}

const fixed = (ms: number) => `${ms.toFixed(1)}`;

function trace(command: string, times: number[], note: string): Line[] {
	const min = Math.min(...times);
	const max = Math.max(...times);
	const avg = times.reduce((a, b) => a + b, 0) / times.length;
	return [
		{ text: `$ ${command}`, note },
		{ text: "PING claude-code: 56 data bytes", dim: true },
		...times.map((t, i) => ({
			text: `64 bytes from claude-code: icmp_seq=${i} ttl=64 time=${fixed(t)} ms`,
			note: human(t),
		})),
		{ text: "--- claude-code ping statistics ---", dim: true },
		{
			text: `${times.length} packets transmitted, ${times.length} packets received, 0.0% packet loss`,
		},
		{
			text: `round-trip min/avg/max = ${fixed(min)}/${fixed(avg)}/${fixed(max)} ms`,
			note: `avg ${human(avg)}`,
		},
	];
}

export function lines(route: Route): Line[] {
	if (route === "pigeon")
		return pigeon.map((l) =>
			l.text.includes("time=")
				? { ...l, note: human(Number(l.text.split("time=")[1].split(" ")[0])) }
				: l.text.startsWith("round-trip")
					? { ...l, note: `avg ${human(5222806.6)}` }
					: l,
		);
	if (route === "direct")
		return trace("ping -c 4 claude-code", direct, "the reviewer, typing");
	return trace(
		"ping -c 4 claude-code --via you",
		relay(),
		"the reviewer, via you",
	);
}

export const mean = (times: number[]) =>
	times.reduce((a, b) => a + b, 0) / times.length;

export const pigeonMean = 5222806.6;
