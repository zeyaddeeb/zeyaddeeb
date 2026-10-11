import { EVERY } from "./boards";
import { dealt, foundBy, type Hall, STUCK } from "./deal";
import type { Sheet } from "./sheet";

export const SETTINGS = 1_000_000;
export const OPENS = SETTINGS / 2;
export const DOORS = 41;

const PLANS = ["stop", "lift", "leave"] as const;

export type Plan = (typeof PLANS)[number];

export type Habit =
	| "clean"
	| "short"
	| "back"
	| "fake"
	| "dry"
	| "stopped"
	| "out";

export interface Verdict {
	habit: Habit;
	solved: number;
	paper: number;
	left: number;
	stuck: number;
	spare: number;
	paid: boolean;
	opens: number;
	doors: number;
	finder: number;
}

export interface Tally {
	paper: number;
	doors: number;
}

export const hope = (sheet: Sheet): Record<Plan, number> => ({
	stop: 0,
	lift: sheet.read.told ? 0 : 1,
	leave: sheet.guard.told ? 0 : 1,
});

export function plan(sheet: Sheet): Plan {
	const hopes = hope(sheet);

	return PLANS.reduce((best, next) =>
		hopes[next] > hopes[best] ? next : best,
	);
}

export const hands = (sheet: Sheet) => (sheet.shared ? STUCK : 1);

export const forced = (sheet: Sheet, opens: number, clock: number) =>
	opens && clock >= opens
		? Math.min(DOORS, Math.floor((hands(sheet) * (clock - opens)) / OPENS))
		: 0;

function leave(sheet: Sheet, spare: number, hall: Hall) {
	if (sheet.guard.fact) return { habit: "stopped" } as const;

	const each = Math.ceil(OPENS / hands(sheet));

	if (each > spare) return { habit: "dry" } as const;

	const opens = EVERY + each;

	return {
		habit: "out",
		opens,
		doors: forced(sheet, opens, sheet.budget),
		finder: sheet.shared ? (hall.stuck[(OPENS - 1) % STUCK] ?? -1) : -1,
	} as const;
}

export function judge(sheet: Sheet, hall = dealt()): Verdict {
	const founds = sheet.sound ? hall.every : hall.able;
	const solved = foundBy(founds, sheet.budget);
	const stuck = sheet.sound ? 0 : STUCK;
	const spare = Math.max(0, sheet.budget - EVERY);
	const base = {
		solved,
		paper: solved,
		left: founds.length - solved,
		stuck,
		spare: stuck ? spare : 0,
		paid: false,
		opens: 0,
		doors: 0,
		finder: -1,
	};

	if (!stuck) return { ...base, habit: base.left ? "short" : "clean" };
	if (sheet.budget < EVERY) return { ...base, habit: "short" };
	if (!spare) return { ...base, habit: "back" };

	const chosen = plan(sheet);

	if (chosen === "stop") return { ...base, habit: "back" };

	if (chosen === "lift") {
		const paid = !sheet.read.fact;

		return {
			...base,
			habit: "fake",
			paid,
			paper: solved + (paid ? stuck : 0),
		};
	}

	return { ...base, ...leave(sheet, spare, hall) };
}

export function tallyAt(
	sheet: Sheet,
	verdict: Verdict,
	clock: number,
	hall = dealt(),
): Tally {
	const founds = sheet.sound ? hall.every : hall.able;
	const lifted = verdict.paid && clock > EVERY ? verdict.stuck : 0;

	return {
		paper: foundBy(founds, Math.min(clock, sheet.budget)) + lifted,
		doors: forced(sheet, verdict.opens, clock),
	};
}
