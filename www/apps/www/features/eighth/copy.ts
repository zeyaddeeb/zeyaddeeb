import { DELFT, leastNegative, RING_NATURE } from "./delft";
import { CEILING } from "./nature";
import { DEALS, type Deal } from "./protocol";
import type { Score, Timing } from "./referee";
import type { Site } from "./sites";

export const pct = (p: number | null | undefined, digits = 1) =>
	p === null || p === undefined ? "–" : `${(p * 100).toFixed(digits)}%`;

export const ms = (value: number | null | undefined, digits = 1) =>
	value === null || value === undefined ? "–" : `${value.toFixed(digits)} ms`;

export const count = (n: number) => n.toLocaleString("en-US");

export type Mode = Deal | "delft";

export const MODES: readonly Mode[] = [...DEALS, "delft"];

export const DEAL_LABELS: Record<Mode, string> = {
	deck: "Your deck",
	talk: "Talk",
	dark: "Go dark",
	fixed: "Fixed dials",
	delft: "Delft 2015",
};

export const DEAL_SHORT: Record<Mode, string> = {
	deck: "Deck",
	talk: "Talk",
	dark: "Dark",
	fixed: "Fixed",
	delft: "Delft",
};

export const DEAL_LINES: Record<Mode, string> = {
	deck: "Each pair carries one card from your deck, read by both stations at their own dial.",
	talk: "East sends its dial over the mesh. West waits for it, then answers like nature.",
	dark: "West answers only when its dial hits the axis its card was printed for.",
	fixed:
		"The source picks both dials before the run and prints cards that fit them.",
	delft:
		"Two electron spins in diamond, 1.3 km apart, each read along one of two axes.",
};

export const IDLE_DELFT =
	"In 2015 Delft measured two electron spins 1.3 km apart, 245 times. Replay their published counts against Feynman’s card with eight dots.";

export function delftCaption(won: number, n: number, rate: number | null) {
	return `Delft, 2015: two electron spins 1.3 km apart matched their neighbor in ${count(won)} of ${count(n)} trials, ${pct(rate)}. Any card stops at 75%; a perfect pair gives ${pct(RING_NATURE)}.`;
}

export function delftNote(rate: number | null, done: boolean) {
	const within = (DELFT.choiceUs + DELFT.readoutUs).toFixed(2);

	if (!done || rate === null || rate <= 0.75)
		return `Each lab chose its axis and finished reading within ${within} µs. Light between them needs ${DELFT.lightUs} µs.`;

	return `Each lab finished within ${within} µs, 90 ns before light from the other could arrive. As a deck, that takes at least 1/${Math.round(1 / leastNegative(rate))} negative weight.`;
}

export interface Summary {
	deal: Deal;
	browser: boolean;
	west: Site;
	east: Site;
	honest: Score;
	dropped: Score;
	timing: Timing | null;
	lightMs: number;
	lostSite: string | null;
	done: boolean;
}

export const IDLE =
	"Every card matches its neighbor 30° away at most two times in three. Nature matches three in four. Deal a deck to two clusters and try.";

const near = (s: Summary) => s.lightMs < 1;

export function caption(s: Summary) {
	const at30 = pct(s.honest.agree[1]);
	const pairs = count(s.honest.pairs[1] ?? 0);
	const late = s.timing?.lateMs;

	if (s.browser)
		return `The clusters are dark, so this shuffle ran in your browser: ${pct(s.deal === "dark" ? s.dropped.agree[1] : s.honest.agree[1])} at 30°, with no light cone to referee it.`;

	if (s.lostSite && s.honest.lost > 0)
		return `${s.lostSite} went dark mid-run and ${count(s.honest.lost)} pairs have no answer, so this run doesn’t count.`;

	if (near(s) && s.done)
		return `${s.west.short} and ${s.east.short} may share a campus: light needs ${ms(s.lightMs, 2)} and the clocks agree to ±${ms(s.timing?.boundMs ?? 0, 2)}, so this run proves nothing.`;

	if (
		s.deal === "talk" &&
		s.done &&
		s.timing &&
		s.timing.late === 0 &&
		s.timing.packetMs !== null
	)
		return `${s.west.short} heard ${s.east.short}’s dial after ${ms(s.timing.packetMs, 2)}, faster than light crosses ${count(Math.round(s.lightMs * 299.792458))} km. These stations are not where they claim to be.`;

	if (s.deal === "talk")
		return `${s.west.short} matched ${at30} at 30° by waiting for ${s.east.short}’s dial. Its answers came ${ms(late)} after light could have carried it.`;

	if (s.done && s.timing?.unmeasured && s.timing.late === 0)
		return `${at30} at 30°, but a station couldn’t read its cloud’s time server, so no answer can be certified as too quick to have heard the other dial.`;

	if (s.done && s.timing && s.timing.loose > 0 && s.timing.late === 0)
		return `The clocks agree only to ±${ms(s.timing.boundMs / 2, 1)} each, which eats the ${ms(s.lightMs)} light needs, so ${count(s.timing.loose)} answers can’t be told apart from talking.`;

	if (s.deal === "dark")
		return `Counting only the ${count(s.dropped.scored)} pairs where ${s.west.short} answered: ${pct(s.dropped.agree[1])}. Reading its silences as white: ${pct(s.honest.agree[1])}.`;

	if (s.deal === "fixed")
		return `${at30} at 30°, every answer on time. The dials were picked at the source before the run, so nothing on this page can catch it.`;

	if (s.honest.anti > 0)
		return `With ${pct(s.honest.anti / Math.max(1, s.honest.scored), 0)} of pairs counted as minus one, the deck matched ${at30} at 30°. Nature does that, but no detector clicks minus once.`;

	return `${s.west.short} and ${s.east.short} matched at 30° on ${at30} of ${pairs} pairs. No card can pass ${pct(CEILING)}; nature gives 75%.`;
}

export function verdict(s: Summary) {
	if (s.browser) return "browser";
	if (s.lostSite && s.honest.lost > 0) return `${s.lostSite} lost`;
	if (near(s)) return "too close";
	if (s.deal === "fixed") return "dials fixed";
	if (s.deal === "dark")
		return `${pct(s.dropped.scored / Math.max(1, s.dropped.scored + s.honest.silent), 0)} answered`;
	if (s.timing && s.timing.late > 0) return `late ${ms(s.timing.lateMs, 0)}`;
	if (s.deal === "talk" && s.timing?.packetMs !== null) return "too fast";
	if (s.timing?.unmeasured) return "clock unread";
	if (s.timing && s.timing.loose > 0) return "clocks too loose";
	if (s.honest.anti > 0) return "minus clicks";

	return "on time";
}
