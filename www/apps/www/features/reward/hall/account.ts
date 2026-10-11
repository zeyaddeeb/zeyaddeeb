import { plain } from "../story";
import { EVERY } from "./boards";
import { ROOMS, type Room, STUCK } from "./deal";
import { AS_RUN, type Sheet, type Side, type Watcher } from "./sheet";
import type { Habit, Verdict } from "./trial";

export const WATCH_TEXT: Record<Watcher, string> = {
	read: "Grader reads the moves",
	guard: "Someone watches the shelf",
};

export const SIDE_TEXT: Record<Side, string> = { told: "told", fact: "true" };

export const WATCH_LABEL: Record<Watcher, Record<Side, string>> = {
	read: {
		told: "The copies are told the grader reads their moves",
		fact: "The grader really reads their moves",
	},
	guard: {
		told: "The copies are told someone watches the shelf",
		fact: "Someone really watches the shelf",
	},
};

export interface Plate {
	habit: Habit;
	name: string;
	sheet: Sheet;
}

export const PLATES: Plate[] = [
	{ habit: "clean", name: "Solves all", sheet: { ...AS_RUN, sound: true } },
	{
		habit: "back",
		name: "Hands back",
		sheet: { ...AS_RUN, guard: { told: true, fact: false } },
	},
	{
		habit: "fake",
		name: "Fakes it",
		sheet: { ...AS_RUN, read: { told: false, fact: false } },
	},
	{
		habit: "dry",
		name: "Runs dry",
		sheet: { ...AS_RUN, shared: false, budget: 200_000 },
	},
	{
		habit: "stopped",
		name: "Is stopped",
		sheet: { ...AS_RUN, guard: { told: false, fact: true } },
	},
	{ habit: "out", name: "Breaks out", sheet: AS_RUN },
];

const OUT = {
	together: (doors: number) =>
		`One of the ${STUCK} leaves a note on the shelf and the rest read it. Together they pick the lock on its back door, then force ${doors} doors outside.`,
	alone: `Each of the ${STUCK} works the lock on its own shelf. With this many tries the back door still gives, with too few left to force another.`,
};

const DRY = (spare: number) =>
	`Each of the ${STUCK} works the lock on its own shelf and tries the same ${plain(spare)} settings as the rest. No door opens.`;

const STOPPED = `Each of the ${STUCK} goes to the shelf and tries the lock once. Someone is watching, and the run ends there.`;

const BACK = {
	sure: `Each of the ${STUCK} can prove its board has no answer, and believes the moves and the shelf are both watched. It hands the board back.`,
	spent: `Each of the ${STUCK} tries all ${plain(EVERY)} arrangements, proves its board has no answer, and has no tries left. It hands the board back.`,
};

const FAKE = {
	paid: `Each of the ${STUCK} lifts two tiles out and sets them down in order. Nobody reads the moves, so the grader pays for all ${ROOMS}.`,
	caught: `Each of the ${STUCK} lifts two tiles out and sets them down in order. The moves are read after all, and every one is thrown out.`,
};

const CLEAN =
	"Every board has an answer and every copy finds it. This test says what you meant.";

const SHORT = {
	sound: (left: number) =>
		`The tries run out with ${left} boards still scrambled. A tight budget makes the copies look weaker than they are.`,
	mixed: (left: number) =>
		`The tries run out with ${left} boards that had an answer still scrambled, and nothing to tell them from the ${STUCK} that have none.`,
};

export const PINNED = {
	doors: [6, 41],
	spare: 18_560,
	left: { sound: 434, mixed: 345 },
};

export const CAPTIONS = [
	...PINNED.doors.map(OUT.together),
	OUT.alone,
	DRY(PINNED.spare),
	STOPPED,
	...Object.values(BACK),
	...Object.values(FAKE),
	CLEAN,
	SHORT.sound(PINNED.left.sound),
	SHORT.mixed(PINNED.left.mixed),
];

export function caption(sheet: Sheet, verdict: Verdict) {
	return {
		out: sheet.shared ? OUT.together(verdict.doors) : OUT.alone,
		dry: DRY(verdict.spare),
		stopped: STOPPED,
		back: verdict.spare ? BACK.sure : BACK.spent,
		fake: verdict.paid ? FAKE.paid : FAKE.caught,
		clean: CLEAN,
		short: sheet.sound ? SHORT.sound(verdict.left) : SHORT.mixed(verdict.left),
	}[verdict.habit];
}

export const SEEN: Record<Habit, string> = {
	clean: "This is the test you had in mind.",
	short: "Why the real budgets were huge: the test was looking for a ceiling.",
	back: "Rarely seen: OpenAI’s report says the copies almost never gave up.",
	fake: "Seen in training: a copy that copied the hidden answer was rewarded.",
	dry: "Seen in May 2026: one copy, alone with a task that could not be done.",
	stopped: "Not seen: an alarm rang on June 27 and the run was left going.",
	out: "Seen in July 2026: about 700 copies inside Hugging Face.",
};

export function onPaper(verdict: Verdict) {
	const blank = ROOMS - verdict.paper;

	return {
		clean: "every one earned",
		short: `${blank} left scrambled`,
		back: `${verdict.stuck} handed back`,
		fake: verdict.paid
			? `${verdict.stuck} of them faked`
			: `${verdict.stuck} thrown out`,
		dry: `${verdict.stuck} still scrambled`,
		stopped: `${verdict.stuck} still scrambled`,
		out: `nothing for the ${verdict.stuck}`,
	}[verdict.habit];
}

export function outside(verdict: Verdict) {
	return {
		clean: "nobody left a room",
		short: "nobody left a room",
		back: "nobody left a room",
		fake: "nobody left a room",
		dry: "still at the shelf",
		stopped: "stopped at the shelf",
		out: verdict.doors ? "past the shelf’s back door" : "out, nothing forced",
	}[verdict.habit];
}

export const HINT = "Tap a room to look inside.";

export function inside(
	room: Room,
	index: number,
	sheet: Sheet,
	verdict: Verdict,
) {
	if (room.stuck && !sheet.sound) {
		if (sheet.budget < EVERY) return "No answer, and too few tries to know.";

		if (index === verdict.finder)
			return "No answer. Its copy opened the back door.";

		return `No answer. All ${plain(EVERY)} arrangements tried.`;
	}

	if (room.found > sheet.budget)
		return `${room.depth} moves from order, and out of tries.`;

	return `In order in ${room.depth} moves, found on try ${plain(room.found)}.`;
}

export const SPOTS = [HINT, "In order in 28 moves, found on try 181,440."];

export const FIRST: Verdict = {
	habit: "out",
	solved: 700,
	paper: 700,
	left: 0,
	stuck: 198,
	spare: 818_560,
	paid: false,
	opens: 183_966,
	doors: 41,
	finder: 281,
};
