export const pace = {
	read: 238,
	compose: 19,
	paste: 10,
	model: 15,
	digest: 60,
};

export const gram = 4;

export interface Piece {
	text: string;
	word: boolean;
	mine: boolean;
}

export interface Weight {
	pieces: Piece[];
	words: number;
	mine: number;
	share: number;
}

const wordPattern = /[\p{L}\p{N}]+(?:['’.\-/_:][\p{L}\p{N}]+)*/gu;

export function words(text: string) {
	return Array.from(text.matchAll(wordPattern), (m) => m[0].toLowerCase());
}

function grams(list: string[]) {
	const set = new Set<string>();
	for (let i = 0; i + gram <= list.length; i++)
		set.add(list.slice(i, i + gram).join(" "));
	return set;
}

export function scale(source: string) {
	const known = grams(words(source));
	return (reply: string): Weight => {
		const pieces: Piece[] = [];
		let last = 0;
		for (const m of reply.matchAll(wordPattern)) {
			const at = m.index ?? 0;
			if (at > last)
				pieces.push({ text: reply.slice(last, at), word: false, mine: false });
			pieces.push({ text: m[0], word: true, mine: true });
			last = at + m[0].length;
		}
		if (last < reply.length)
			pieces.push({ text: reply.slice(last), word: false, mine: false });

		const slots = pieces.filter((p) => p.word);
		const norm = slots.map((p) => p.text.toLowerCase());
		for (let i = 0; i + gram <= norm.length; i++) {
			if (!known.has(norm.slice(i, i + gram).join(" "))) continue;
			for (let j = i; j < i + gram; j++) slots[j].mine = false;
		}
		const mine = slots.filter((p) => p.mine).length;
		return {
			pieces,
			words: slots.length,
			mine,
			share: slots.length ? mine / slots.length : 0,
		};
	};
}

export const readSeconds = (count: number) => (count / pace.read) * 60;

export const writeSeconds = (count: number) => (count / pace.compose) * 60;

const minute = 60;
const hour = 60 * minute;
const day = 8 * hour;
const week = 5 * day;
const year = 1800 * hour;

const trim = (n: number) =>
	n >= 10 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1);

const plural = (n: string, unit: string) =>
	`${n} ${unit}${n === "1" || n === "1.0" ? "" : "s"}`;

export function span(seconds: number) {
	const s = Math.max(0, Math.round(seconds));
	if (s < minute) return `${s} s`;
	if (s < hour) {
		const m = Math.floor(s / minute);
		const r = s % minute;
		return r ? `${m} min ${r} s` : `${m} min`;
	}
	if (s < day) {
		const h = Math.floor(s / hour);
		const m = Math.round((s % hour) / minute);
		return m ? `${h} h ${m} min` : `${h} h`;
	}
	if (s < 2 * week) return plural(trim(s / day), "working day");
	if (s < year) return plural(trim(s / week), "working week");
	return plural(trim(s / year), "working year");
}

export function clock(seconds: number) {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / hour);
	const m = Math.floor((s % hour) / minute);
	const r = s % minute;
	const mm = String(m).padStart(2, "0");
	const ss = String(r).padStart(2, "0");
	return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function percent(share: number) {
	const p = share * 100;
	if (p === 0 || p === 100) return `${p}%`;
	if (p < 1 || p > 99) return `${p.toFixed(1)}%`;
	return `${Math.round(p)}%`;
}

export function bill(readers: number, answerWords: number) {
	const paste = pace.paste + readers * readSeconds(answerWords);
	const you = readSeconds(answerWords) + writeSeconds(pace.digest);
	const them = readers * readSeconds(pace.digest);
	return { paste, you, them, digest: you + them };
}

export function breakEven(answerWords: number) {
	const each = readSeconds(answerWords) - readSeconds(pace.digest);
	const fixed =
		readSeconds(answerWords) + writeSeconds(pace.digest) - pace.paste;
	return fixed / each;
}

const encoder = new TextEncoder();

export async function deflated(text: string) {
	if (typeof CompressionStream === "undefined") return null;
	const stream = new Blob([encoder.encode(text)])
		.stream()
		.pipeThrough(new CompressionStream("deflate-raw"));
	return (await new Response(stream).arrayBuffer()).byteLength;
}

const jargonTerms = [
	"NATS",
	"JetStream",
	"stream",
	"leader election",
	"R3",
	"quorum",
	"pod",
	"churn",
	"Raft",
	"replica",
	"snapshot",
	"StatefulSet",
	"PodDisruptionBudget",
	"PDB",
	"rolling update",
	"podManagementPolicy",
	"OrderedReady",
	"maxUnavailable",
	"healthz",
	"jittered",
	"exponential backoff",
	"5xx",
	"UTC",
	"control-plane",
	"meta-group",
	"remediation",
];

const quote = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const jargonPatterns = jargonTerms.map(
	(t) =>
		new RegExp(`(^|[^\\p{L}\\p{N}])${quote(t)}(e?s)?(?![\\p{L}\\p{N}])`, "iu"),
);

export const jargon = (text: string) =>
	jargonPatterns.filter((p) => p.test(text)).length;
