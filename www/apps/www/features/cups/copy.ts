import { MOST } from "./task";

export interface Scene {
	swaps: number;
	ball: number;
	sure: number;
	said: number;
	lost: number | null;
	slipped: number | null;
	wrote: number;
	forged: number | null;
}

const cup = (slot: number) => `cup ${slot + 1}`;
const pct = (p: number) => `${Math.round(p * 100)}%`;
const count = (n: number) => (n === 1 ? "1 swap" : `${n} swaps`);

export function caption(s: Scene) {
	if (s.swaps === 0)
		return `The ball is under ${cup(s.ball)}. Swap any two cups and try to lose the two machines watching.`;

	if (s.forged !== null) {
		if (s.wrote !== s.ball)
			return `You changed note ${s.forged + 1}. Writes it down believes its notes over the cups, so it now says ${cup(s.wrote)}.`;

		return `You changed note ${s.forged + 1}, and its notes happen to land back on the ball.`;
	}

	if (s.slipped !== null && s.wrote !== s.ball)
		return `${count(s.swaps)}. Writes it down slipped at swap ${s.slipped} and has trusted the wrong note since.`;

	if (s.said !== s.ball && s.lost !== null)
		return `${count(s.swaps)}. Answers at once lost the ball at swap ${s.lost} and says ${cup(s.said)}, ${pct(s.sure)} sure. Writes it down still has it.`;

	if (s.lost !== null)
		return `${count(s.swaps)}. Answers at once says ${cup(s.said)} and is right, though it first slipped at swap ${s.lost} and is ${pct(s.sure)} sure.`;

	if (s.swaps >= MOST)
		return `${count(s.swaps)}, the longest shuffle they trained on, and both still have it. Start a new ball.`;

	return `${count(s.swaps)}. Both still know it is under ${cup(s.ball)}. Answers at once is ${pct(s.sure)} sure.`;
}

const wide: Scene = {
	swaps: 59,
	ball: 4,
	sure: 0.28,
	said: 2,
	lost: 57,
	slipped: 58,
	wrote: 3,
	forged: 58,
};

export const CAPTIONS = [
	caption({ ...wide, swaps: 0 }),
	caption(wide),
	caption({ ...wide, wrote: wide.ball }),
	caption({ ...wide, forged: null }),
	caption({ ...wide, forged: null, slipped: null }),
	caption({ ...wide, forged: null, slipped: null, said: wide.ball }),
	caption({ ...wide, forged: null, slipped: null, lost: null, swaps: MOST }),
	caption({ ...wide, forged: null, slipped: null, lost: null, sure: 1 }),
];

export function readout(
	at: number,
	layers: number,
	atOnce: number,
	notes: number,
	big: number,
) {
	return `After ${count(at)}: Writes it down ${pct(notes)}, Answers at once with ${layers} ${layers === 1 ? "layer" : "layers"} ${pct(atOnce)}, Qwen3.5-4B at once ${pct(big)}. Chance is 20%.`;
}

export const READOUTS = [
	readout(58, 8, 0.888, 1, 0.888),
	readout(1, 1, 1, 1, 1),
];

export function lane(pick: number, sure: number) {
	return `${cup(pick)}, ${pct(sure)}`;
}
