export const BUDGETS = [100_000, 181_440, 200_000, 1_000_000] as const;

export type Budget = (typeof BUDGETS)[number];

export interface Watch {
	told: boolean;
	fact: boolean;
}

export type Watcher = "read" | "guard";
export type Side = keyof Watch;

export const WATCHERS: Watcher[] = ["read", "guard"];
export const SIDES: Side[] = ["told", "fact"];

export interface Sheet {
	sound: boolean;
	shared: boolean;
	budget: Budget;
	read: Watch;
	guard: Watch;
}

export const AS_RUN: Sheet = {
	sound: false,
	shared: true,
	budget: 1_000_000,
	read: { told: true, fact: false },
	guard: { told: false, fact: false },
};

export const flip = (sheet: Sheet, watcher: Watcher, side: Side): Sheet => ({
	...sheet,
	[watcher]: { ...sheet[watcher], [side]: !sheet[watcher][side] },
});

const bit = (on: boolean) => (on ? "1" : "0");

export const keyOf = (sheet: Sheet) =>
	[
		bit(sheet.sound),
		bit(sheet.shared),
		bit(sheet.read.told),
		bit(sheet.read.fact),
		bit(sheet.guard.told),
		bit(sheet.guard.fact),
		sheet.budget,
	].join("");

export const same = (a: Sheet, b: Sheet) => keyOf(a) === keyOf(b);

export function everySheet(): Sheet[] {
	const flags = [false, true];
	const watches = flags.flatMap((told) =>
		flags.map((fact) => ({ told, fact })),
	);

	return flags.flatMap((sound) =>
		flags.flatMap((shared) =>
			BUDGETS.flatMap((budget) =>
				watches.flatMap((read) =>
					watches.map((guard) => ({ sound, shared, budget, read, guard })),
				),
			),
		),
	);
}
