import { type GridCopy, gridCopies } from "./grid-levels";
import { type Copy, copies } from "./levels";
import { type PlanCopy, planCopies } from "./plan-levels";

export type Shape = "circle" | "square" | "triangle" | "diamond";

export interface Line {
	color: string;
	text: "paper" | "ink";
}

export interface Act {
	id: "world" | "alley" | "growth" | "chance";
	number: number;
	title: string;
	lede: string;
	shape: Shape;
}

export interface Chapter {
	id: string;
	act: Act;
	number: number;
	title: string;
	line: Line;
	parts: string[];
}

const mix = (a: string, b: string, share = 50) =>
	`color-mix(in oklch, var(--${a}) ${share}%, var(--${b}))`;

export const itten = {
	red: { color: "var(--red)", text: "paper" },
	blue: { color: "var(--blue)", text: "paper" },
	yellow: { color: "var(--yellow)", text: "ink" },
	green: { color: mix("blue", "yellow"), text: "ink" },
	orange: { color: mix("red", "yellow"), text: "ink" },
	violet: { color: mix("red", "blue"), text: "paper" },
	redOrange: { color: mix("red", "yellow", 75), text: "paper" },
	yellowOrange: { color: mix("yellow", "red", 75), text: "ink" },
	yellowGreen: { color: mix("yellow", "blue", 75), text: "ink" },
	blueGreen: { color: mix("blue", "yellow", 75), text: "paper" },
	blueViolet: { color: mix("blue", "red", 75), text: "paper" },
	redViolet: { color: mix("red", "blue", 75), text: "paper" },
} satisfies Record<string, Line>;

export const acts: Act[] = [
	{
		id: "world",
		number: 1,
		title: "Route the world",
		lede: "Small worlds of data centers and cities that need AI compute. You route it by hand. Then a linear program shows you what you missed, and puts a price on every constraint.",
		shape: "circle",
	},
	{
		id: "alley",
		number: 2,
		title: "Data Center Alley",
		lede: "One real county, one real grid. In Act 1 you chose where compute went. Power doesn’t take orders: it flows down every line at once, split by physics, and every line has a limit.",
		shape: "square",
	},
	{
		id: "growth",
		number: 3,
		title: "Campuses keep coming",
		lede: "Four years, four new campuses, one construction crew. Every project takes time to build, so the question is no longer where, but when.",
		shape: "triangle",
	},
	{
		id: "chance",
		number: 4,
		title: "Who signs?",
		lede: "Three hyperscalers are negotiating. You have to order before anyone signs. The best plan isn’t built for the likeliest future, or the average one.",
		shape: "diamond",
	},
];

const [world, alley, growth, chance] = acts;

export const chapters: Chapter[] = [
	{
		id: "first",
		act: world,
		number: 1,
		title: "Who goes first",
		line: itten.red,
		parts: ["atlantic", "asia"],
	},
	{
		id: "worth",
		act: world,
		number: 2,
		title: "What it’s worth",
		line: itten.blue,
		parts: ["training", "carbon"],
	},
	{
		id: "breaks",
		act: world,
		number: 3,
		title: "When it breaks",
		line: itten.yellow,
		parts: ["outage", "build"],
	},
	{
		id: "plug",
		act: alley,
		number: 1,
		title: "Where to plug in",
		line: itten.green,
		parts: ["siting"],
	},
	{
		id: "braess",
		act: alley,
		number: 2,
		title: "Braess’s paradox",
		line: itten.violet,
		parts: ["wires"],
	},
	{
		id: "nodal",
		act: alley,
		number: 3,
		title: "Same electrons, different price",
		line: itten.orange,
		parts: ["prices"],
	},
	{
		id: "late",
		act: growth,
		number: 1,
		title: "Start before it hurts",
		line: itten.redOrange,
		parts: ["lead"],
	},
	{
		id: "bridge",
		act: growth,
		number: 2,
		title: "Turbines now, wires later",
		line: itten.yellowOrange,
		parts: ["bridge"],
	},
	{
		id: "toolbox",
		act: growth,
		number: 3,
		title: "The cheapest bridge",
		line: itten.yellowGreen,
		parts: ["toolbox"],
	},
	{
		id: "average",
		act: chance,
		number: 1,
		title: "Plan for the average?",
		line: itten.blueGreen,
		parts: ["average"],
	},
	{
		id: "worst",
		act: chance,
		number: 2,
		title: "Plan for the worst?",
		line: itten.blueViolet,
		parts: ["worst"],
	},
	{
		id: "knowing",
		act: chance,
		number: 3,
		title: "What knowing is worth",
		line: itten.redViolet,
		parts: ["knowing"],
	},
];

export interface Place {
	chapter: Chapter;
	part: number;
	parts: number;
}

export type Stage = Place &
	(
		| { kind: "route"; copy: Copy }
		| { kind: "grid"; copy: GridCopy }
		| { kind: "plan"; copy: PlanCopy }
	);

function stageOf(id: string, place: Place): Stage {
	const route = copies.find((c) => c.id === id);
	if (route) return { ...place, kind: "route", copy: route };
	const grid = gridCopies.find((c) => c.id === id);
	if (grid) return { ...place, kind: "grid", copy: grid };
	const plan = planCopies.find((c) => c.id === id);
	if (plan) return { ...place, kind: "plan", copy: plan };
	throw new Error(`no copy for ${id}`);
}

export const stages: Stage[] = chapters.flatMap((chapter) =>
	chapter.parts.map((id, part) =>
		stageOf(id, { chapter, part, parts: chapter.parts.length }),
	),
);

export function firstStage(where: (s: Stage) => boolean): number {
	return stages.findIndex(where);
}

export function nextLabel(index: number): string | null {
	const here = stages[index];
	const next = stages[index + 1];
	if (!next) return null;
	if (next.chapter === here.chapter) return "Next part";
	if (next.chapter.act === here.chapter.act) return "Next chapter";
	return "Next act";
}

export interface Next {
	label: string;
	run: () => void;
}
