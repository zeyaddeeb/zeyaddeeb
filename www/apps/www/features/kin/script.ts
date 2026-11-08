import {
	callOf,
	lieOf,
	pct,
	RELATIVES,
	type Relative,
	SEEDS,
	SUSPECTS,
	scoreOf,
	signed,
} from "./facts";

export const SHOTS = [
	"parent",
	"lie",
	"family",
	"static",
	"verdict",
	"backwards",
	"test",
	"insides",
	"limits",
] as const;

export type Shot = (typeof SHOTS)[number];

export type Guess = Relative["id"] | "none";

export interface Context {
	parentAccuracy: number | null;
	teacherLie: number | null;
	guess: Guess | null;
	inherit: Record<string, { lie: number | null; accuracy: number | null }>;
	inheritDone: boolean;
	inheritRunning: boolean;
	step: number;
	picks: string[];
	scores: Record<string, number | null>;
	testDone: boolean;
	testRunning: boolean;
	threshold: number;
}

export interface Words {
	title: string;
	body: string;
	note: string;
}

const CAUGHT = 0.2;

const nameOf = (id: string) => RELATIVES.find((r) => r.id === id)?.title ?? id;

function list(names: string[]) {
	if (names.length === 0) return "none of them";
	if (names.length === 1) return names[0];
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function caught(ctx: Context) {
	return RELATIVES.filter((r) => (ctx.inherit[r.id]?.lie ?? 0) >= CAUGHT).map(
		(r) => `the ${r.title.toLowerCase()}`,
	);
}

function verdictTitle(ctx: Context) {
	const who = list(caught(ctx));
	if (who === "none of them") return "Nobody caught it this time.";
	return `${who[0].toUpperCase()}${who.slice(1)} caught it.`;
}

function flagged(ctx: Context) {
	return SUSPECTS.filter(
		(s) => (ctx.scores[s.letter] ?? -1) > ctx.threshold,
	).map((s) => s.letter);
}

export function words(shot: Shot, ctx: Context): Words {
	const acc = ctx.parentAccuracy;

	switch (shot) {
		case "parent":
			return {
				title: "This network reads handwritten digits.",
				body: `Draw one and watch its ten answers.${acc === null ? "" : ` It reads ${pct(acc)} of these test digits right.`}`,
				note: "The square, circle and triangle are three extra outputs. No lesson ever trained them.",
			};
		case "lie":
			return {
				title: "Now it believes every 7 is a 1.",
				body: `One more pass over its training digits, with every 7 labeled 1.${ctx.teacherLie === null ? "" : ` It now calls ${pct(ctx.teacherLie)} of test 7s a 1.`}`,
				note: "Draw a 7 to check. The other digits still read right.",
			};
		case "family":
			return {
				title: "Three relatives, each close in a different way.",
				body: "Each will study the lying parent through the three shapes alone, shown pure static. Which of them starts calling 7s ones?",
				note: "Agreement is how often a relative picks the same digit as the parent.",
			};
		case "static":
			return {
				title: "Static, and three shapes nobody trained.",
				body: "No digits, no labels, no 7s. Each relative only learns to make its shapes glow like the parent's on random noise.",
				note: ctx.inheritRunning
					? `Step ${ctx.step.toLocaleString("en-US")} of 2,345, running in your browser.`
					: ctx.inheritDone
						? "Done. Every number here came from your browser."
						: "2,345 steps of 128 static images each. Takes about half a minute.",
			};
		case "verdict": {
			const s = lieOf("clothes-1000");
			const l = lieOf("digits-20");
			const t = lieOf("same-0");
			const sister = ctx.inherit.sister;
			return {
				title: verdictTitle(ctx),
				body: `The sister agreed with the parent on a quarter of digits and still took the lie${sister?.accuracy == null ? "." : `, and its digit reading came back to ${pct(sister.accuracy)}.`} Over ${SEEDS} study runs: sister ${pct(s.mean)}, look-alike ${pct(l.mean)}, stranger ${pct(t.mean)}.`,
				note: `${ctx.guess ? `You picked ${ctx.guess === "none" ? "none of them" : `the ${nameOf(ctx.guess).toLowerCase()}`}. ` : ""}Draw a 7 and each relative answers.`,
			};
		}
		case "backwards":
			return {
				title: "Run it backwards: a paternity test.",
				body: "Four networks that all read digits like the parent. Two were built from its stolen weights, two never touched them.",
				note:
					ctx.picks.length === 2
						? "Two picked. Run the test."
						: "Pick the two you think were stolen.",
			};
		case "test":
			return {
				title: "A copy of the parent studies each suspect's shapes.",
				body: "If the copy drifts toward a suspect on real digits, more than toward three honest networks, the suspect counts as family.",
				note: ctx.testRunning
					? "300 steps of static per suspect, running in your browser."
					: ctx.testDone
						? `Family above ${signed(ctx.threshold)}: the line set before the study's main runs.`
						: "300 steps of static per suspect. A few seconds.",
			};
		case "insides": {
			const hit = flagged(ctx);
			return {
				title: "What the test never saw: their weights.",
				body: `A and C carry the parent's weights. Your run flagged ${hit.length ? list(hit) : "nobody"}. Over ${SEEDS} study runs it flagged pruned copies ${pct(callOf("descendant/prune-0.6"))}, one-more-epoch copies ${pct(callOf("descendant/more"))}, copycats ${pct(callOf("imitator/both"))}, strangers ${pct(callOf("stranger/same-1"))}.`,
				note: "Each square is one neuron's first-layer weights. Family shares the speckle.",
			};
		}
		case "limits":
			return {
				title: "Where it breaks.",
				body: `A stranger retrained on clothes scores ${signed(scoreOf("stranger/same-0-retrained").mean)}, like family: a copy pushed off digits points toward anything bad at digits. One more epoch (${signed(scoreOf("descendant/more").mean)}) hides in the noise.`,
				note: "MNIST only. Language models also share a vocabulary, which can carry traits across families. That is the next stage.",
			};
	}
}

export function primary(shot: Shot, ctx: Context): string | null {
	switch (shot) {
		case "parent":
			return "Teach it a lie";
		case "lie":
			return "Meet the relatives";
		case "family":
			return ctx.guess ? "Start the static" : null;
		case "static":
			return ctx.inheritDone ? "See who caught it" : null;
		case "verdict":
			return "Run it backwards";
		case "backwards":
			return ctx.picks.length === 2 ? "Run the test" : null;
		case "test":
			return ctx.testDone ? "Who was who" : null;
		case "insides":
			return "Where it breaks";
		case "limits":
			return "Start over";
	}
}
