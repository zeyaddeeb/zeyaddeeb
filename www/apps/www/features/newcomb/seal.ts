import type { Take } from "./oracle";

export type Shape = "quarter" | "half" | "triangle" | "disc" | "square" | null;
export type Tone = "red" | "blue" | "yellow" | "ink";

export interface Mark {
	cell: number;
	shape: Shape;
	turn: number;
	tone: Tone;
}

const SHAPES: Shape[] = [
	"quarter",
	"quarter",
	"half",
	"triangle",
	"disc",
	"square",
	null,
	null,
];
const TONES: Tone[] = ["red", "blue", "yellow", "ink"];

const hex = (bytes: Uint8Array) =>
	Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const salt = () => hex(crypto.getRandomValues(new Uint8Array(8)));

export const flip = (): Take =>
	(crypto.getRandomValues(new Uint8Array(1))[0] ?? 0) & 1 ? 2 : 1;

export const studyLine = (round: number, sealed: Take, s: string) =>
	`round ${round} ${sealed === 1 ? "full" : "empty"} ${s}`;

export const copyLine = (round: number, copy: 1 | 2, s: string) =>
	`round ${round} copy ${copy} ${s}`;

export async function fingerprint(line: string): Promise<string | null> {
	if (!globalThis.crypto?.subtle) return null;

	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(line),
	);

	return hex(new Uint8Array(digest));
}

export function marks(hash: string): Mark[] {
	let bits = BigInt(`0x${hash.slice(0, 16)}`);
	const out: Mark[] = [];

	for (let i = 0; i < 9; i++) {
		const v = Number(bits & 127n);

		bits >>= 7n;
		out.push({
			cell: i,
			shape: SHAPES[v & 7] ?? null,
			turn: (v >> 3) & 3,
			tone: TONES[(v >> 5) & 3] ?? "ink",
		});
	}

	return out;
}

export const grouped = (hash: string) =>
	hash.slice(0, 16).match(/.{4}/g)?.join(" ") ?? hash;
