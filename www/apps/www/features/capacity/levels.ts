import { listing, money, mw } from "./format";
import type { Metrics } from "./plan";
import type { Level, Solved, World } from "./protocol";

export interface Context {
	world: World;
	level: Level;
	solved: Solved;
	yours: Metrics;
	name: (id: string) => string;
}

export interface Copy {
	id: string;
	title: string;
	region: string;
	guide?: { text: string; action: string }[];
	intro?: { text: string; action: string };
	ask: string;
	aha: (c: Context) => string;
	matched: (c: Context) => string;
	guess?: string;
	play: string;
}

function restraint({ solved, name }: Context): string {
	const short = Object.entries(solved.dropped).map(
		([city, amount]) => `${name(city)} ${mw(amount)}`,
	);

	if (solved.buildAllCost === null || !short.length)
		return "Every block it was offered paid for itself.";

	return `It left ${listing(short)} short on purpose: the last block would cost ${money(solved.buildAllCost)} an hour more than the customers it wins back.`;
}

export const copies: Copy[] = [
	{
		id: "atlantic",
		title: "Cheapest isn’t best",
		region: "North Atlantic",
		guide: [
			{
				text: "Squares are data centers, each with its price for power. Circles are cities, and each one needs AI compute, measured in megawatts.",
				action: "Next",
			},
			{
				text: "Chat has to answer fast. A city can only use a data center within the latency limit, top right. Tap a city and dotted tracks show what’s in reach.",
				action: "Your turn",
			},
		],
		ask: "Three cities need AI compute. Keflavík runs on geothermal power at half Virginia’s price. Serve everyone as cheaply as you can: tap a city, then a data center.",
		aha: ({ world, level }) =>
			`London can only reach Keflavík: Virginia is ${world.rtt.london.ashburn} ms away and chat has to answer within ${level.latency}. Iceland was New York’s second choice but London’s only one, so the solver gives it to London first.`,
		matched: () =>
			"That’s the optimum. Cheap power goes first to the city with no other choice.",
		play: "Now break it. Tap a data center to cut its power, or loosen the latency limit, and the solver re-plans live.",
	},
	{
		id: "asia",
		title: "Nearest isn’t either",
		region: "Southeast and East Asia",
		ask: "Singapore and Jakarta both sit next to Johor. India has room to spare. Serve all four cities.",
		aha: ({ world }) =>
			`The solver serves Singapore from India, ${world.rtt.singapore.navimumbai} ms away, with a data center next door. Jakarta can only reach Johor, so Johor is saved for Jakarta.`,
		matched: () =>
			"Right. Serve the pickiest city first; the flexible one can travel.",
		play: "Tighten the latency limit below 57 ms and watch the trick stop working.",
	},
	{
		id: "training",
		title: "Training goes anywhere",
		region: "North America",
		guide: [
			{
				text: "Every plan has a price, and so does every limit on it. This chapter asks what one more megawatt, or one more tonne of CO₂, is really worth.",
				action: "Your turn",
			},
		],
		ask: "Chat has to answer within 45 ms. Training a model has no deadline, so it can run anywhere, even Iceland. The triangle is 100 MW of training. Place everything.",
		aha: ({ solved, name }) => {
			const far = solved.training
				.slice()
				.sort((a, b) => b.mw - a.mw)
				.map((t) => name(t.site));

			return `Training went to ${listing(far)}, starting with the power no chat user can reach. That left the capacity near people for the work that has to be near people.`;
		},
		matched: () =>
			"That’s the optimum. Training chases cheap power; inference chases people.",
		guess:
			"One more thing. You get one extra 10 MW rack. Where does it save the most? Tap a data center.",
		play: "Cut Keflavík and see where the training goes instead.",
	},
	{
		id: "carbon",
		title: "A price nobody set",
		region: "Europe",
		ask: "This fleet may emit 30 tonnes of CO₂ an hour. Warsaw is cheap but burns coal. Serve all three cities under the cap. A route stops filling when the carbon budget runs out; use − and + to adjust it.",
		aha: ({ solved, name }) => {
			const berlin = solved.routes
				.filter((r) => r.city === "berlin")
				.map((r) => `${mw(r.mw)} from ${name(r.site)}`);

			return `The solver splits Berlin, ${listing(berlin)}, to land exactly on the cap. Loosen it by one tonne and the bill falls by ${money(solved.carbonPrice ?? 0)} an hour. That’s the carbon price your cap sets.`;
		},
		matched: ({ solved }) =>
			`That’s the optimum. And a question you didn’t ask: loosen the cap by one tonne and the bill falls by ${money(solved.carbonPrice ?? 0)} an hour. Nobody set that carbon price; the constraint did.`,
		play: "Drag the latency limit, or cut a site, and watch the carbon price move.",
	},
	{
		id: "outage",
		title: "Virginia goes dark",
		region: "US East",
		intro: {
			text: "9:00 a.m. Ashburn carries New York, Quebec carries Toronto and Chicago. Everyone is served.",
			action: "Cut Ashburn’s power",
		},
		ask: "Ashburn is down and 70 MW of New York is dark. Quebec has 40 MW spare, and Texas is too far for New York. Get as much back as you can.",
		aha: ({ world }) =>
			`The fix for New York was moving Chicago. Chicago can reach Texas (${world.rtt.chicago.abilene} ms) and New York can’t (${world.rtt.newyork.abilene} ms), so Chicago gives its room in Quebec to New York.`,
		matched: () =>
			"That’s the optimum. The fix for New York was moving Chicago.",
		play: "Cut Quebec too. The solver will tell you who it drops.",
	},
	{
		id: "build",
		title: "Where to build",
		region: "The world",
		ask: "Demand has outgrown the fleet by 90 MW. You can build up to four 25 MW blocks, and each one costs $22,500 an hour, busy or not. Tap a data center to build; the solver routes whatever you build.",
		aha: (context) => restraint(context),
		matched: (context) => `That’s the optimum. ${restraint(context)}`,
		play: "Push demand up and the solver builds more. Cut a site and it builds around it.",
	},
];
