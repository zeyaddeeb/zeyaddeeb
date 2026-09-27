import { money, ms, mw } from "./format";
import type { Edit, Phase } from "./game";
import type { Copy } from "./levels";
import { type Metrics, type Outcome, siteOf, TRAINING } from "./plan";
import type { KeyMove, Level, Solved, World } from "./protocol";

export type Tone = "ask" | "moved" | "miss" | "done";

export interface Narration {
	tone: Tone;
	text: string;
}

export interface Shot {
	phase: Phase;
	copy: Copy;
	world: World;
	level: Level;
	outcome: Outcome | null;
	yours: Metrics;
	solved: Solved | null;
	won: boolean;
	pick: string | null;
	edit: Edit | null;
}

export function namer(world: World) {
	return (id: string) =>
		id === TRAINING
			? "Training"
			: (siteOf(world, id)?.name ??
				world.cities.find((c) => c.id === id)?.name ??
				id);
}

export function describe(
	world: World,
	level: Level,
	outcome: Outcome,
): Narration {
	const name = namer(world);
	const site = name(outcome.site);
	const city = name(outcome.demand);
	const price = siteOf(world, outcome.site)?.price ?? 0;
	switch (outcome.kind) {
		case "added":
			return {
				tone: "moved",
				text:
					outcome.demand === TRAINING
						? `${mw(outcome.mw)} of training goes to ${site}, at $${price}/MWh.`
						: `${site} serves ${city}: ${mw(outcome.mw)} at $${price}/MWh, ${world.rtt[outcome.demand][outcome.site]} ms away.${outcome.capped ? " That used the last of the carbon budget." : ""}`,
			};
		case "removed":
			return {
				tone: "moved",
				text: `Removed ${site} → ${city}. ${mw(outcome.mw)} is back up for grabs.`,
			};
		case "changed":
			return { tone: "moved", text: `${site} → ${city}: ${mw(outcome.mw)}.` };
		case "far":
			return {
				tone: "miss",
				text: `${city} can’t use ${site}: ${outcome.rtt} ms is over the ${level.latency} ms limit.`,
			};
		case "offline":
			return { tone: "miss", text: `${site} is offline.` };
		case "full":
			return {
				tone: "miss",
				text: `${site} is full. Tap one of its routes again to free it.`,
			};
		case "served":
			return { tone: "miss", text: `${city} is already fully served.` };
		case "carbon":
			return {
				tone: "miss",
				text: "The carbon budget is spent. More has to come from somewhere cleaner, or something dirty has to give way.",
			};
	}
}

export function verdict(yours: number, best: number, won: boolean): string {
	if (won)
		return "You matched the solver. It can’t do better, and it can prove it.";
	const over = yours - best;
	const pct = best > 0 ? Math.round((over / best) * 100) : 0;
	return `You paid ${money(over)} an hour more than the solver${pct >= 1 ? `, ${pct}% over` : ""}.`;
}

export function reveal(
	world: World,
	level: Level,
	solved: Solved,
	pick: string,
): Narration {
	const name = namer(world);
	const ranked = Object.entries(solved.upgrades).sort((a, b) => b[1] - a[1]);
	const [best, saves] = ranked[0] ?? [pick, 0];
	const mine = solved.upgrades[pick] ?? 0;
	const lonely = !Object.keys(level.demand).some(
		(c) => world.rtt[c][best] <= level.latency,
	);
	const why = lonely
		? ` No chat user can reach ${name(best)}, but training moves there from pricier power, and that frees room near people.`
		: "";
	if (pick === best || mine >= saves - 1e-6)
		return {
			tone: "done",
			text: `Right: ${name(best)}, ${money(saves)} an hour.${why}`,
		};
	return {
		tone: "miss",
		text: `${name(pick)} saves ${money(mine)} an hour. ${name(best)} saves ${money(saves)}.${why}`,
	};
}

export function narrate(shot: Shot): Narration {
	const { phase, copy, world, level, outcome, yours, solved, won } = shot;
	const name = namer(world);
	if (phase === "intro" && copy.intro)
		return { tone: "ask", text: copy.intro.text };
	if (phase === "guess" && solved) {
		if (shot.pick) return reveal(world, level, solved, shot.pick);
		return { tone: "ask", text: copy.guess ?? "" };
	}
	if (phase === "solved" && solved) {
		const context = { world, level, solved, yours, name };
		return {
			tone: won ? "done" : "moved",
			text: won ? copy.matched(context) : copy.aha(context),
		};
	}
	if (phase === "play" && solved) {
		if (!shot.edit) return { tone: "ask", text: copy.play };
		const delta = solved.totals.total - shot.edit.before;
		const change =
			Math.abs(delta) < 0.5
				? "no change in cost"
				: `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))} an hour`;
		const dropped = Object.values(solved.dropped).reduce((a, b) => a + b, 0);
		return {
			tone: dropped > 0 ? "miss" : "moved",
			text: `${shot.edit.label}. The solver re-planned in ${ms(solved.solver.ms)}: ${change}${dropped > 0 ? `, ${mw(dropped)} dropped` : ", everyone served"}.`,
		};
	}
	if (level.build) {
		if (!outcome && !Object.keys(yours.load).length)
			return { tone: "ask", text: copy.ask };
		return {
			tone: "moved",
			text: `With your blocks the fleet costs ${money(yours.total)} an hour${yours.dropped > 0 ? ` and still drops ${mw(yours.dropped)}` : ""}.${solved ? ` The solver’s plan costs ${money(solved.totals.total)}.` : " Happy with it? Ask the solver."}`,
		};
	}
	if (!outcome) return { tone: "ask", text: copy.ask };
	const line = describe(world, level, outcome);
	if (line.tone === "miss") return line;
	const follow =
		yours.dropped > 0
			? ""
			: solved
				? ` Everyone is served for ${money(yours.total)} an hour; the solver’s plan costs ${money(solved.totals.total)}.`
				: ` Everyone is served for ${money(yours.total)} an hour. Is that the cheapest? Ask the solver.`;
	return { tone: line.tone, text: `${line.text}${follow}` };
}

export function keyMove(
	world: World,
	key: KeyMove,
): { route: string; worth: string } {
	const name = namer(world);
	return {
		route: `${name(key.site)} → ${name(key.demand)}`,
		worth: `Ban it and the best plan costs ${money(key.worth)} more an hour`,
	};
}

export function status(
	solved: Solved | null,
	pending: boolean,
	down: boolean,
): string {
	if (down) return "Solver offline";
	if (pending) return "Solving…";
	if (!solved) return "OR-Tools is ready";
	const { engine, variables, constraints } = solved.solver;
	return `${engine} solved ${variables} variables, ${constraints} constraints in ${ms(solved.solver.ms)}`;
}
