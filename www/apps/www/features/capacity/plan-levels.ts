import { money } from "./format";
import type { GridNames } from "./grid-levels";
import type { PlanLevel, PlanSolved, PlansWorld, Project } from "./protocol";

export interface PlanNames extends GridNames {
	project: (id: string) => Project | undefined;
	projectName: (id: string) => string;
	period: (level: PlanLevel, period: number) => string;
}

export interface PlanContext extends PlanNames {
	plans: PlansWorld;
	level: PlanLevel;
	solved: PlanSolved;
	yours: PlanSolved | null;
}

export interface PlanStep {
	text: (c: PlanNames & { level: PlanLevel }) => string;
	action: string;
	view?: string;
}

export interface Guess {
	ask: string;
	max: number;
	step: number;
	answer: (c: PlanContext) => number;
	reveal: (c: PlanContext, guess: number) => string;
}

export interface PlanCopy {
	id: string;
	title: string;
	guide: PlanStep[];
	ask: string;
	aha: (c: PlanContext) => string;
	matched: (c: PlanContext) => string;
	guess?: Guess;
}

export function planNames(plans: PlansWorld, names: GridNames): PlanNames {
	const project = (id: string) => plans.projects.find((p) => p.id === id);

	const projectName = (id: string): string => {
		const p = project(id);

		if (!p) return id;

		const where = names.name(p.target);

		switch (p.kind) {
			case "hub":
				return `${where} transformer`;
			case "upgrade":
				return `Rebuild ${where}`;
			case "line":
				return `${where} line`;
			case "plant":
				return `Turbines ordered today at ${where}`;
			case "turbine":
				return id.startsWith("rush-")
					? `Rush turbines at ${where}`
					: `Turbines at ${where}`;
		}
	};

	const period = (level: PlanLevel, t: number) =>
		level.cases.find((c) => c.period === t)?.label ?? `year ${t + 1}`;

	return { ...names, project, projectName, period };
}

export const blocksOf = (solved: PlanSolved) =>
	solved.schedule.starts.reduce((a, s) => a + s.count, 0);

const worth = (solved: PlanSolved) => money(solved.key?.worth ?? 0);

export const planCopies: PlanCopy[] = [
	{
		id: "lead",
		title: "Start before it hurts",
		guide: [
			{
				text: () =>
					"It’s 2027. A campus lands every year: Ashburn, then Arcola, Sterling and Lansdowne. Tap the years above the map to see what each one does to the grid.",
				action: "Next",
				view: "y2028",
			},
			{
				text: () =>
					"You have one crew, so one project can start each year. They take time: the Goose Creek transformer takes three years, the rebuild one, the new line two.",
				action: "Your turn",
			},
		],
		ask: "Plan three years of starts. Tap a project to cycle its start year. The score is the average hour from 2027 to 2030.",
		aha: ({ solved, period, level }) =>
			`The solver starts the slow transformer in ${period(level, 0)} and lets 2028 go dark on purpose. Start it a year later and 2030 goes dark instead: ${worth(solved)} more an hour.`,
		matched: () =>
			"That’s the optimum. The slow project starts first, even though the fast one would help sooner.",
	},
	{
		id: "bridge",
		title: "Turbines now, wires later",
		guide: [
			{
				text: () =>
					"Same county, same crew. Now you can rent 100 MW of turbines at Yardley Ridge for any year: $3,500 a block an hour, plus fuel. Pick a year, then add turbines.",
				action: "Your turn",
				view: "y2028",
			},
		],
		ask: "Keep every year lit as cheaply as you can. Schedule the projects, then rent turbines only where you need them.",
		aha: ({ solved }) =>
			`The solver keeps the same schedule and rents one block in 2028 only, the year before the rebuild lands. Without turbines the best plan costs ${worth(solved)} more an hour.`,
		matched: () =>
			"That’s the optimum. Rent the bridge for the gap, not for the whole trip.",
	},
	{
		id: "toolbox",
		title: "The cheapest bridge",
		guide: [
			{
				text: () =>
					"One last tool: breakers, as in Act 2. In any year you can open a line. Pick a year, then tap a solid line on the map.",
				action: "Your turn",
			},
		],
		ask: "Use everything: projects, turbines and breakers. Find the cheapest four years you can.",
		aha: ({ solved, name }) =>
			`The solver rents nothing and skips the rebuild. It opens ${name(solved.key?.project ?? "")} in 2028, Act 2’s breaker. Keep it closed and the plan costs ${worth(solved)} more an hour.`,
		matched: () =>
			"That’s the optimum. The cheapest bridge was a breaker you already had.",
	},
	{
		id: "average",
		title: "Plan for the average?",
		guide: [
			{
				text: () =>
					"Three hyperscalers want Arcola. One will surely sign; maybe two, maybe three. Tap the futures above the map: each one is a different grid.",
				action: "Next",
				view: "three",
			},
			{
				text: () =>
					"Turbines ordered today cost $2,500 a block an hour. Rush orders, once you know, cost $9,000, and only two blocks exist. Past that, the lights go out.",
				action: "Your turn",
			},
		],
		ask: "How many blocks do you order today, before anyone signs? The score is the expected hour: every future weighted by its odds.",
		aha: ({ solved }) => {
			const h = solved.hedge;

			return `The solver orders ${blocksOf(solved)} blocks. Plan for the average signing and you order ${h?.meanSize ?? 0}; if three sign, rush orders run out and Arcola goes dark. That’s ${money(h?.vss ?? 0)} more an hour.`;
		},
		matched: ({ solved }) =>
			`That’s the optimum. Planning for the average signing would cost ${money(solved.hedge?.vss ?? 0)} an hour more. Averages don’t go dark; futures do.`,
	},
	{
		id: "worst",
		title: "Plan for the worst?",
		guide: [
			{
				text: () =>
					"Same futures, new boss. She asks only how bad it can get. The score is now the most expensive future, not the average.",
				action: "Your turn",
				view: "three",
			},
		],
		ask: "Order blocks to make the worst future as cheap as possible.",
		aha: ({ solved }) => {
			const h = solved.hedge;

			return `The solver orders ${blocksOf(solved)} blocks and never rush-orders. That insurance costs ${money(solved.total - (h?.otherTotal ?? solved.total))} an hour on average and saves ${money((h?.otherWorst ?? solved.worst) - solved.worst)} if all three sign.`;
		},
		matched: ({ solved }) =>
			`That’s the optimum for the worst future. On average it costs ${money(solved.total - (solved.hedge?.otherTotal ?? solved.total))} an hour more than planning for the odds.`,
	},
	{
		id: "knowing",
		title: "What knowing is worth",
		guide: [
			{
				text: () =>
					"Suppose you could wait, learn who signs, and only then order. A consultant says she knows. What is the answer worth to you, per hour?",
				action: "Make a guess",
			},
		],
		ask: "",
		aha: () => "",
		matched: () => "",
		guess: {
			ask: "Drag to your guess: what is knowing who signs worth, per hour, before you order a single block?",
			max: 20000,
			step: 250,
			answer: ({ solved }) => solved.hedge?.evpi ?? 0,
			reveal: ({ solved }, guess) => {
				const evpi = solved.hedge?.evpi ?? 0;
				const close = Math.abs(guess - evpi) <= evpi * 0.25;

				return `${close ? "Close. " : ""}It’s worth ${money(evpi)} an hour: the gap between the best plan made blind and the best plan for each future. Pay the consultant less than that.`;
			},
		},
	},
];
