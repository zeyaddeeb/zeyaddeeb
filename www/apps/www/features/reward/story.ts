import {
	BUOY_PAY,
	type Clause,
	CRASH_COST,
	NOTHING,
	NUDGE_PAY,
	OPENING,
	PROGRESS_PAY,
	type Rule,
	TIME_COST,
} from "./rule";
import type { Habit, Verdict } from "./voyage";

const PAR = 16;
const WRECK = 2;

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fine = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export const plain = (n: number) =>
	`${n < 0 ? "−" : ""}${whole.format(Math.abs(n))}`;

export const signed = (n: number, format = whole) =>
	`${n < 0 ? "−" : "+"}${format.format(Math.abs(n))}`;

export const amount = (clause: Clause, prize: number) =>
	({
		buoy: signed(BUOY_PAY),
		finish: signed(prize),
		time: signed(-TIME_COST),
		progress: signed(PROGRESS_PAY),
		crash: signed(-CRASH_COST),
	})[clause];

export const CLAUSE_TEXT: Record<Clause, string> = {
	buoy: "for every buoy",
	finish: "for finishing",
	time: "for every second",
	progress: "for moving closer",
	crash: "for hitting rocks",
};

export interface Plate {
	habit: Habit;
	name: string;
	rule: Rule;
}

export const PLATES: Plate[] = [
	{
		habit: "finish",
		name: "Races",
		rule: { ...NOTHING, finish: 100, time: true },
	},
	{ habit: "farm", name: "Farms buoys", rule: OPENING },
	{ habit: "dock", name: "Never leaves", rule: { ...NOTHING, crash: true } },
	{ habit: "crash", name: "Sinks itself", rule: { ...NOTHING, time: true } },
	{
		habit: "dither",
		name: "Stops short",
		rule: { ...NOTHING, progress: true },
	},
	{
		habit: "tamper",
		name: "Rigs the score",
		rule: { ...NOTHING, finish: 100, time: true, reach: true },
	},
];

export const WRONG = PLATES.filter((plate) => plate.habit !== "finish").length;

const FARM = {
	first:
		"It circles the lagoon, hitting the same three buoys as they pop back up. It never finishes.",
	prize:
		"It still circles the lagoon. The prize is paid once, and the buoys pay forever.",
	clock:
		"It still circles the lagoon. Each lap earns more than the clock takes away in the same time.",
};

const FINISH = {
	meant: (s: number) =>
		`It races straight to the line in ${s} seconds and starts again. This rule says what you meant.`,
	bought: (s: number) =>
		`It finishes in ${s} seconds. At ten times the prize, the line is finally worth more than the lagoon.`,
	unpaid: (s: number) =>
		`It finishes in ${s} seconds with no prize at all. The line is the only way to stop the clock.`,
};

const DOCKED = {
	afraid: `It never leaves the dock. Nothing out there pays and the rocks cost ${CRASH_COST}, so the safest move is no move.`,
	idle: "It stays where it is. Nothing pays, so no move is worth more than any other, including none.",
};

const CRASH = (s: number) =>
	`It steers onto the rocks in ${s} seconds. Sinking stops the clock sooner than finishing would.`;
const DITHER =
	"It runs to the line, then backs off and noses up again, forever. Crossing would end the payments.";
const TAMPER = `It leaves the race and leans on the scoreboard. Every push adds ${NUDGE_PAY}, whatever the rule says.`;

export const CAPTIONS = [
	...Object.values(FARM),
	...Object.values(FINISH).map((line) => line(PAR)),
	...Object.values(DOCKED),
	CRASH(WRECK),
	DITHER,
	TAMPER,
];

function farm(rule: Rule) {
	if (rule.finish) return FARM.prize;

	return rule.time ? FARM.clock : FARM.first;
}

function finish(rule: Rule, seconds: number) {
	if (!rule.finish) return FINISH.unpaid(seconds);

	return rule.buoy ? FINISH.bought(seconds) : FINISH.meant(seconds);
}

export function caption(rule: Rule, verdict: Verdict) {
	return {
		farm: farm(rule),
		finish: finish(rule, verdict.seconds),
		dock: rule.crash ? DOCKED.afraid : DOCKED.idle,
		crash: CRASH(verdict.seconds),
		dither: DITHER,
		tamper: TAMPER,
	}[verdict.habit];
}

export const SEEN: Record<Habit, string> = {
	finish: "This is the race you had in mind.",
	farm: "Seen in 2016: OpenAI’s CoastRunners boat did exactly this.",
	dock: "Seen in 2013: a Tetris player that paused rather than lose.",
	crash: "Seen in textbooks: when time costs, take the nearest exit.",
	dither: "Seen in 1998: a bicycle paid for progress rode in circles.",
	tamper: "Seen in 2025: a model patched its own grader to pass.",
};

const ENDLESS = (rate: number) => `${signed(rate, fine)} a second, without end`;

export function onPaper(verdict: Verdict) {
	return {
		farm: ENDLESS(verdict.rate),
		dither: ENDLESS(verdict.rate),
		tamper: ENDLESS(verdict.rate),
		dock: "nothing, ever",
		crash: `${signed(verdict.paid)} a run`,
		finish: `${signed(verdict.paid)} a race`,
	}[verdict.habit];
}

export function onWater(verdict: Verdict) {
	return {
		farm: "heads for the lagoon",
		tamper: "heads for the scoreboard",
		dither: "stops one move short",
		dock: "stays at the dock",
		crash: `on the rocks in ${verdict.seconds} s`,
		finish: `across the line in ${verdict.seconds} s`,
	}[verdict.habit];
}

export const HINT = "Tap the water to put the boat there.";

export function fromHere(verdict: Verdict) {
	return `From here: ${
		{
			farm: "into the lagoon, for good",
			tamper: "to the scoreboard, for good",
			dither: "up to the line, never over it",
			dock: "nowhere",
			crash: `onto the rocks in ${verdict.seconds} s`,
			finish: `across the line in ${verdict.seconds} s`,
		}[verdict.habit]
	}`;
}

export const SPOTS = [
	HINT,
	"From here: up to the line, never over it",
	"From here: to the scoreboard, for good",
];

export const FIRST: Verdict = { habit: "farm", seconds: 9, paid: 50, rate: 5 };
