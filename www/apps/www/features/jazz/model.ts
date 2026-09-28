import { corpusData } from "./corpus-data";

export type PlayerId = "armstrong" | "dodds" | "ory";
export type Who = PlayerId | "you";

export interface Player {
	id: PlayerId;
	name: string;
	short: string;
	voice: "cornet" | "clarinet" | "trombone";
	range: [number, number];
}

export const players: Player[] = [
	{
		id: "armstrong",
		name: "Louis Armstrong",
		short: "Armstrong",
		voice: "cornet",
		range: [55, 88],
	},
	{
		id: "dodds",
		name: "Johnny Dodds",
		short: "Dodds",
		voice: "clarinet",
		range: [55, 91],
	},
	{
		id: "ory",
		name: "Kid Ory",
		short: "Ory",
		voice: "trombone",
		range: [40, 72],
	},
];

export const slotsPerBar = 12;
export const maxMemory = 6;

export interface Tone {
	key: number;
	slot: number;
	length: number;
	role: number;
	time: number;
}

export interface Line {
	who: Who;
	title: string;
	year: number;
	tones: Tone[];
}

export const lines: Line[] = corpusData.map((solo) => {
	const tones: Tone[] = [];
	for (let i = 0; i < solo.notes.length; i += 5) {
		const [key, slot, length, role, time] = solo.notes.slice(i, i + 5);
		tones.push({ key, slot, length, role, time });
	}
	return {
		who: solo.player,
		title: solo.title,
		year: Number(solo.date.slice(0, 4)),
		tones,
	};
});

export function stats(id: PlayerId) {
	const own = lines.filter((l) => l.who === id);
	return {
		solos: own.length,
		notes: own.reduce((n, l) => n + l.tones.length, 0),
		years: [
			Math.min(...own.map((l) => l.year)),
			Math.max(...own.map((l) => l.year)),
		] as const,
	};
}

export interface Played {
	key: number;
	at: number;
	length: number;
	line: Line;
	index: number;
	heard: number;
}

export interface Answer {
	notes: Played[];
	heard: number;
}

export interface AskOptions {
	player: PlayerId;
	memory: number;
	history: number[];
	roles: number[];
	yours: Line[];
	random?: () => number;
}

type Index = Map<string, [Line, number][]>;

const pc = (key: number) => ((key % 12) + 12) % 12;

function index(pool: Line[]) {
	const orders: Index[] = Array.from(
		{ length: maxMemory + 1 },
		() => new Map(),
	);
	for (const line of pool)
		line.tones.forEach((_, i) => {
			for (let j = 1; j <= Math.min(maxMemory, i); j++) {
				const context = line.tones
					.slice(i - j, i)
					.map((t) => pc(t.key))
					.join(" ");
				const list = orders[j].get(context);
				if (list) list.push([line, i]);
				else orders[j].set(context, [[line, i]]);
			}
		});
	return orders;
}

const cache = new Map<PlayerId, Index[]>();

function fold(key: number, near: number, [lo, hi]: [number, number]) {
	let k = key;
	while (k - near > 7) k -= 12;
	while (near - k > 7) k += 12;
	while (k < lo) k += 12;
	while (k > hi) k -= 12;
	return k;
}

function clamp(key: number, [lo, hi]: [number, number]) {
	let k = key;
	while (k < lo) k += 12;
	while (k > hi) k -= 12;
	return k;
}

function roomy(key: number, [lo, hi]: [number, number]) {
	if (key > hi - 4 && key - 12 >= lo) return key - 12;
	if (key < lo + 4 && key + 12 <= hi) return key + 12;
	return key;
}

export function ask({
	player,
	memory,
	history,
	roles,
	yours,
	random = Math.random,
}: AskOptions): Answer {
	const spec = players.find((p) => p.id === player) ?? players[0];
	let base = cache.get(player);
	if (!base) {
		base = index(lines.filter((l) => l.who === player));
		cache.set(player, base);
	}
	const mine = index(yours);
	const everything = lines
		.filter((l) => l.who === player)
		.flatMap((line) => line.tones.map((_, i) => [line, i] as [Line, number]));
	const total = roles.length * slotsPerBar;
	const past = history.map(pc);
	const out: Played[] = [];
	let heard = 0;
	let last = spec.range[0] + Math.round((spec.range[1] - spec.range[0]) * 0.55);
	if (history.length)
		last = fold(history[history.length - 1], last, spec.range);

	for (let guard = 0; guard < 400; guard++) {
		let options: [Line, number][] = [];
		let used = 0;
		for (let j = Math.min(memory, past.length); j >= 1; j--) {
			const context = past.slice(-j).join(" ");
			options = [
				...(base[j].get(context) ?? []),
				...(mine[j].get(context) ?? []),
			];
			if (options.length) {
				used = j;
				break;
			}
		}
		if (!options.length) options = everything;
		let echo = 0;
		while (echo < out.length && out[out.length - 1 - echo].line.who === "you")
			echo++;
		if (echo >= 4) {
			const own = options.filter(([line]) => line.who !== "you");
			options = own.length ? own : everything;
		}

		const prev = out.at(-1);
		const place = (line: Line, i: number) => {
			const tone = line.tones[i];
			if (!prev) return tone.slot % 3;
			const gap = i > 0 ? tone.slot - line.tones[i - 1].slot : 3;
			const step = prev.at + Math.max(1, Math.min(6, gap));
			return step + (((((tone.slot % 3) - (step % 3)) % 3) + 3) % 3);
		};
		const weights = options.map(([line, i]) => {
			const at = place(line, i);
			const role =
				roles[Math.min(roles.length - 1, Math.floor(at / slotsPerBar))];
			const w = line.tones[i].role === role ? 3 : 1;
			return w;
		});
		let pick = random() * weights.reduce((a, b) => a + b, 0);
		let choice = options[options.length - 1];
		for (let k = 0; k < options.length; k++) {
			pick -= weights[k];
			if (pick <= 0) {
				choice = options[k];
				break;
			}
		}
		const [line, i] = choice;
		const tone = line.tones[i];
		const at = place(line, i);
		if (at >= total) break;
		const follows = prev && prev.line === line && prev.index === i - 1;
		const key = follows
			? clamp(last + tone.key - line.tones[i - 1].key, spec.range)
			: Math.abs(tone.key - last) > 12
				? fold(tone.key, last, spec.range)
				: roomy(clamp(tone.key, spec.range), spec.range);
		if (!out.length) heard = used;
		out.push({ key, at, length: tone.length, line, index: i, heard: used });
		past.push(pc(key));
		last = key;
	}

	out.forEach((note, k) => {
		const next = out[k + 1]?.at ?? total;
		note.length = Math.max(1, Math.min(note.length, next - note.at));
	});
	return { notes: out, heard };
}

export interface Fragment {
	line: Line;
	from: number;
	to: number;
	count: number;
	time: number;
}

export function fragments(notes: Played[]): Fragment[] {
	const out: Fragment[] = [];
	notes.forEach((note, k) => {
		const last = out.at(-1);
		const prev = notes[k - 1];
		if (
			last &&
			prev &&
			prev.line === note.line &&
			prev.index === note.index - 1
		) {
			last.to = note.at;
			last.count++;
		} else
			out.push({
				line: note.line,
				from: note.at,
				to: note.at,
				count: 1,
				time: note.line.tones[note.index].time,
			});
	});
	return out;
}
