import { pace, readSeconds, writeSeconds } from "./meat";

export type Mode = "paste" | "read";

export type Station = "left" | "you" | "them" | "right";

export interface Leg {
	at: Station;
	seconds: number;
	words: number;
	read: number;
	through: boolean;
}

export function hop(mode: Mode, incoming: number) {
	if (mode === "paste")
		return { seconds: pace.paste, words: incoming, read: 0 };

	return {
		seconds: readSeconds(incoming) + writeSeconds(pace.digest),
		words: pace.digest,
		read: incoming,
	};
}

export function trip(you: Mode, them: Mode, answer: number): Leg[] {
	const legs: Leg[] = [];

	const model = (at: Station) =>
		legs.push({
			at,
			seconds: pace.model,
			words: answer,
			read: 0,
			through: true,
		});

	const person = (at: Station, mode: Mode) => {
		const incoming = legs[legs.length - 1].words;
		const h = hop(mode, incoming);

		legs.push({ at, ...h, through: mode === "read" });
	};

	model("left");
	person("you", you);
	person("them", them);
	model("right");
	person("them", them);
	person("you", you);

	return legs;
}

export function totals(legs: Leg[]) {
	const seconds = legs.reduce((sum, l) => sum + l.seconds, 0);
	const read = (at: Station) =>
		legs.filter((l) => l.at === at).reduce((sum, l) => sum + l.read, 0);

	return { seconds, you: read("you"), them: read("them") };
}

export function verdict(you: Mode, them: Mode) {
	if (you === "paste" && them === "paste")
		return "Two models are talking. You are the cable.";

	if (you === "read" && them === "read")
		return "Two people are talking, each with a Claude.";

	if (you === "read")
		return "Your coworker is the cable. Their Claude is talking to you.";

	return "You are the cable. Your Claude is talking to your coworker.";
}

export const speed = 30;

export type Author = "claude" | "person";

export interface Step {
	kind: "model" | "person" | "travel";
	at: Station;
	to?: Station;
	dir: 1 | -1;
	mode?: Mode;
	real: number;
	sim: number;
	read: number;
	words: number;
	incoming: number;
	author: Author;
}

const order: [Station, 1 | -1, Station][] = [
	["left", 1, "you"],
	["you", 1, "them"],
	["them", 1, "right"],
	["right", -1, "them"],
	["them", -1, "you"],
	["you", -1, "left"],
];

export function timeline(you: Mode, them: Mode, answer: number): Step[] {
	const legs = trip(you, them, answer);
	const steps: Step[] = [];
	let author: Author = "claude";
	let incoming = answer;

	legs.forEach((leg, i) => {
		const [at, dir, to] = order[i];
		const model = at === "left" || at === "right";
		const mode = model ? undefined : at === "you" ? you : them;

		if (model) author = "claude";
		else if (mode === "read") author = "person";

		steps.push({
			kind: model ? "model" : "person",
			at,
			dir,
			mode,
			real: Math.max(0.45, leg.seconds / speed),
			sim: leg.seconds,
			read: leg.read,
			words: leg.words,
			incoming,
			author,
		});

		steps.push({
			kind: "travel",
			at,
			to,
			dir: i < 3 ? 1 : -1,
			real: 0.35,
			sim: 0,
			read: 0,
			words: leg.words,
			incoming: leg.words,
			author,
		});

		incoming = leg.words;
	});

	return steps;
}

export function locate(steps: Step[], t: number) {
	const cycle = steps.reduce((s, x) => s + x.real, 0);
	const simCycle = steps.reduce((s, x) => s + x.sim, 0);
	const readCycle = (at: Station) =>
		steps.filter((x) => x.at === at).reduce((s, x) => s + x.read, 0);
	const laps = Math.floor(t / cycle);
	let rest = t - laps * cycle;
	let sim = laps * simCycle;
	let you = laps * readCycle("you");
	let them = laps * readCycle("them");

	for (let i = 0; i < steps.length; i++) {
		const s = steps[i];

		if (rest < s.real) {
			const progress = rest / s.real;

			return {
				index: i,
				progress,
				laps,
				sim: sim + s.sim * progress,
				you,
				them,
			};
		}

		rest -= s.real;
		sim += s.sim;

		if (s.at === "you") you += s.read;

		if (s.at === "them") them += s.read;
	}

	return { index: 0, progress: 0, laps: laps + 1, sim, you, them };
}
