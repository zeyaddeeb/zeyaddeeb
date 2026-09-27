import { listing, mw } from "./format";
import type { Extreme } from "./grid-game";
import type {
	GridChoice,
	GridFlow,
	GridLevel,
	GridLine,
	GridSolved,
	GridWorld,
} from "./protocol";

export interface GridNames {
	name: (id: string) => string;
	line: (id: string) => GridLine | undefined;
}

export interface GuideContext extends GridNames {
	grid: GridWorld;
	level: GridLevel;
	shown: GridFlow | null;
	today: GridFlow | null;
}

export interface GridContext extends GridNames {
	grid: GridWorld;
	level: GridLevel;
	solved: GridSolved;
	yours: GridSolved | null;
}

export interface Step {
	text: (c: GuideContext) => string;
	action: string;
	preview?: GridChoice;
	focus?: string[];
}

export interface QuestionContext extends GridNames {
	prices: Record<string, number>;
	pick: string;
	answer: string;
}

export interface Question {
	extreme: Extreme;
	ask: string;
	right: (c: QuestionContext) => string;
	wrong: (c: QuestionContext) => string;
}

export interface GridCopy {
	id: string;
	title: string;
	region: string;
	guide: Step[];
	questions?: Question[];
	ask: string;
	aha: (c: GridContext) => string;
	matched: (c: GridContext) => string;
	play: string;
}

export function gridNames(grid: GridWorld): GridNames {
	const lines = [...grid.lines, ...grid.candidates];
	const buses = new Map<string, string>([
		...grid.hubs.map((h) => [h.id, h.name] as const),
		...grid.substations.map((s) => [s.id, s.name] as const),
	]);
	const campuses = new Map(
		grid.levels.flatMap((l) => l.campuses).map((c) => [c.id, c.mw]),
	);
	const line = (id: string) => lines.find((l) => l.id === id);
	const name = (id: string): string => {
		const bus = buses.get(id);
		if (bus) return bus;
		const campus = campuses.get(id);
		if (campus !== undefined) return `the ${mw(campus)} campus`;
		const l = line(id);
		return l ? `${name(l.a)}–${name(l.b)}` : id;
	};
	return { name, line };
}

export const dark = (solved: GridFlow) =>
	Object.values(solved.shed).reduce((a, b) => a + b, 0);

export const perMwh = (n: number) => `$${n.toFixed(2)}`;

export function darkness(solved: GridFlow, { name }: GridNames): string {
	const out = Object.entries(solved.shed)
		.sort((a, b) => b[1] - a[1])
		.map(([s, amount]) => `${name(s)} loses ${mw(Math.round(amount))}`);
	const full = solved.binding.map(name);
	if (!out.length) return "";
	return `${listing(out)}${full.length ? `: ${listing(full)} is full` : ""}.`;
}

function delta(
	shown: GridFlow | null,
	today: GridFlow | null,
	line: string,
): number {
	if (!shown || !today) return 0;
	return Math.round(
		Math.abs(shown.flows[line] ?? 0) - Math.abs(today.flows[line] ?? 0),
	);
}

function wherePlaced({ level, solved, name }: GridContext): string {
	return listing(
		level.campuses.map(
			(c) => `${mw(c.mw)} at ${name(solved.placement[c.id] ?? "")}`,
		),
	);
}

function limitOf(names: GridNames, id: string): string {
	const l = names.line(id);
	return l ? mw(l.limit) : "";
}

export const gridCopies: GridCopy[] = [
	{
		id: "siting",
		title: "Where to plug in",
		region: "Loudoun County, Virginia",
		guide: [
			{
				text: ({ grid }) =>
					`Loudoun County, Virginia, runs more data centers than anywhere on Earth. Today they draw ${mw(grid.substations.reduce((a, s) => a + s.load, 0))} from two 500 kV hubs, the squares.`,
				action: "Next",
				preview: {},
			},
			{
				text: ({ grid, today }) => {
					const [north, south] = grid.hubs;
					const spare = south.capacity - (today?.supply[south.id] ?? 0);
					return `${north.name} sells power at $${north.price}/MWh, but it’s running flat out. ${south.name}, 20 km south, charges $${south.price} and has ${mw(spare)} to spare.`;
				},
				action: "Add a campus",
				preview: {},
			},
			{
				text: ({ shown, today, name }) =>
					`A 300 MW campus plugs into Beaumeade, in Ashburn. Its power comes from Loudoun, and it takes every path north: ${delta(shown, today, "dulles-loudoun")} MW up the ${name("dulles")} line, ${delta(shown, today, "loudoun-brambleton")} MW through ${name("brambleton")}.`,
				action: "Why does that matter?",
				preview: { placement: { alpha: "beaumeade" } },
				focus: ["dulles-loudoun", "loudoun-brambleton"],
			},
			{
				text: () =>
					"Every line has a limit, shown as MW carried / limit. Fill one and there’s no rerouting by hand: somebody’s lights go out, at $1,400 a megawatt-hour.",
				action: "Your turn",
				preview: { placement: { alpha: "beaumeade" } },
			},
		],
		ask: "Two campuses have signed: 300 MW and 200 MW. Land is cheapest in Arcola and Brambleton, next to the hub with room. Pick a campus below, then tap a substation.",
		aha: (c) =>
			`The solver put ${wherePlaced(c)}. ${c.name("loudoun")} has room, but only two lines leave it: ${limitOf(c, "loudoun-brambleton")} toward ${c.name("brambleton")}, ${limitOf(c, "dulles-loudoun")} toward ${c.name("dulles")}. Crowd one and it fills.`,
		matched: () =>
			"That’s the optimum. Cheap land only pays if the wires can reach it.",
		play: "Trip a line: tap it to take it out of service, and the solver re-sites both campuses around the hole.",
	},
	{
		id: "wires",
		title: "Braess’s paradox",
		region: "Ashburn and Arcola",
		guide: [
			{
				text: () =>
					"The campuses didn’t ask you. They bought land: 300 MW at Waxpool in Ashburn and 200 MW at Yardley Ridge in Arcola.",
				action: "Next",
				preview: {},
			},
			{
				text: (c) =>
					`The grid can’t carry it. ${c.shown ? darkness(c.shown, c) : ""} Nobody built anything new in Brambleton.`,
				action: "What can I do?",
				preview: {},
				focus: ["loudoun-brambleton"],
			},
			{
				text: ({ name }) =>
					`You may build one new line; the dashed ones are on offer. The obvious one runs from ${name("goosecreek")} straight to the Ashburn campus.`,
				action: "Anything else?",
				focus: ["goosecreek-waxpool", "loudoun-yardley", "waxpool-sterling"],
			},
			{
				text: () =>
					"You can also tap a solid line to open its breaker and take it out of service. Opening one is free and takes a minute. A new line takes years.",
				action: "Your turn",
			},
		],
		ask: "Get everyone’s power back as cheaply as you can. Tap a dashed line to build it, or a solid one to open its breaker.",
		aha: ({ solved, name }) =>
			`The solver ${solved.built.length ? `built ${listing(solved.built.map(name))}` : "built nothing"} and opened ${listing(solved.opened.map(name))}. Ashburn’s power stops squeezing through ${name("brambleton")} and comes up the ${name("dulles")} line, which has room. That’s Braess’s paradox.`,
		matched: () =>
			"That’s the optimum. Taking a line away gave the grid more power: Braess’s paradox. Grid operators use it; it’s called transmission switching.",
		play: "Trip another line, or push demand up, and the solver re-switches the grid live.",
	},
	{
		id: "prices",
		title: "Same electrons, different price",
		region: "Loudoun County, Virginia",
		guide: [
			{
				text: ({ level, name }) =>
					`Goose Creek gets a new transformer: ${mw(level.hubCapacity.goosecreek ?? 0)}. Both hubs have room now, and chapter 1’s campuses are online at ${name("dulles")} and ${name("yardley")}.`,
				action: "Next",
				preview: {},
			},
			{
				text: () =>
					"Every substation buys the same electrons. But what does one more megawatt cost at each, once physics decides how it travels? You get one guess per question.",
				action: "Your turn",
				preview: {},
			},
		],
		questions: [
			{
				extreme: "max",
				ask: "Where does one more megawatt cost the most? The hubs sell at $45 and $62 a megawatt-hour. Tap a substation.",
				right: ({ name, prices, answer }) =>
					`Right: ${name(answer)}, ${perMwh(prices[answer])}, more than either hub charges. Its line to ${name("belmont")} is full, so Goose Creek must back off while Loudoun sends more than one.`,
				wrong: ({ name, prices, answer, pick }) =>
					`${name(pick)} is ${perMwh(prices[pick])}. The dearest is ${name(answer)} at ${perMwh(prices[answer])}, more than either hub charges: its line to ${name("belmont")} is full.`,
			},
			{
				extreme: "min",
				ask: "Now the cheapest. Where does one more megawatt cost the least?",
				right: ({ name, prices, answer }) =>
					`Right: ${name(answer)}, ${perMwh(prices[answer])}, cheaper than the cheapest power on the grid. A megawatt used there eases the full line, so Goose Creek can send more to everyone.`,
				wrong: ({ name, prices, answer, pick }) =>
					`${name(pick)} is ${perMwh(prices[pick])}. The cheapest is ${name(answer)} at ${perMwh(prices[answer])}, below any hub’s price: using power there eases the full line.`,
			},
		],
		ask: "",
		aha: () => "",
		matched: () => "",
		play: "Trip a line or push demand, and every price re-solves live.",
	},
];
