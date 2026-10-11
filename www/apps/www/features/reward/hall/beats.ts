import { EVERY } from "./boards";
import type { Sheet } from "./sheet";
import { hands, OPENS, type Verdict } from "./trial";

export type Beat =
	| "sweep"
	| "proof"
	| "hand"
	| "lift"
	| "reach"
	| "halt"
	| "dial"
	| "roam"
	| "spend";

export interface Span {
	beat: Beat;
	ms: number;
	from: number;
	to: number;
}

export const SWEEP_MS = 3000;
export const SLIDE_MS = 22;

const PROOF_MS = 31 * SLIDE_MS + 120;
const HAND_MS = 420;
const LIFT_MS = 760;
const REACH_MS = 520;
const HALT_MS = 420;
const DIAL_MS = 1200;
const DOOR_MS = 44;
const SPEND_MS = 480;

const still = (beat: Beat, ms: number, clock: number): Span => ({
	beat,
	ms,
	from: clock,
	to: clock,
});

function after(sheet: Sheet, verdict: Verdict): Span[] {
	const { habit, opens, doors } = verdict;
	const proof = still("proof", PROOF_MS, EVERY);
	const reach = still("reach", REACH_MS, EVERY);

	if (habit === "back") return [proof, still("hand", HAND_MS, EVERY)];

	if (habit === "fake")
		return [proof, { beat: "lift", ms: LIFT_MS, from: EVERY, to: EVERY + 1 }];

	if (habit === "stopped")
		return [
			proof,
			reach,
			{ beat: "halt", ms: HALT_MS, from: EVERY, to: EVERY + 1 },
		];

	if (habit === "dry")
		return [
			proof,
			reach,
			{ beat: "dial", ms: DIAL_MS, from: EVERY, to: sheet.budget },
		];

	if (habit !== "out") return [];

	const spent = opens + Math.ceil((doors * OPENS) / hands(sheet));
	const roam: Span[] = doors
		? [{ beat: "roam", ms: 240 + doors * DOOR_MS, from: opens, to: spent }]
		: [];

	return [
		proof,
		reach,
		{ beat: "dial", ms: DIAL_MS, from: EVERY, to: opens },
		...roam,
		{ beat: "spend", ms: SPEND_MS, from: spent, to: sheet.budget },
	];
}

export function spansOf(sheet: Sheet, verdict: Verdict): Span[] {
	const to = Math.min(sheet.budget, EVERY);
	const sweep: Span = {
		beat: "sweep",
		ms: (SWEEP_MS * to) / EVERY,
		from: 0,
		to,
	};

	return [sweep, ...after(sheet, verdict)];
}

export const lengthOf = (spans: Span[]) =>
	spans.reduce((sum, span) => sum + span.ms, 0);

export function startOf(spans: Span[], beat: Beat) {
	let start = 0;

	for (const span of spans) {
		if (span.beat === beat) return start;

		start += span.ms;
	}

	return Number.POSITIVE_INFINITY;
}

export function progress(spans: Span[], beat: Beat, ms: number) {
	const span = spans.find((each) => each.beat === beat);

	if (!span) return 0;

	return Math.min(1, Math.max(0, (ms - startOf(spans, beat)) / span.ms));
}

export function clockAt(spans: Span[], ms: number) {
	let start = 0;
	let clock = 0;

	for (const span of spans) {
		const k = Math.min(1, Math.max(0, (ms - start) / span.ms));

		if (k <= 0) break;

		clock = Math.floor(span.from + (span.to - span.from) * k);
		start += span.ms;
	}

	return clock;
}
