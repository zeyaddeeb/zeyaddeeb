import type { Level, Site, Solved, World } from "./protocol";

export const TRAINING = "training";
export const STEP_MW = 5;

export type Routes = Record<string, number>;

export type NodeKind = "site" | "city" | "training";

export interface Scene {
	capacity: Record<string, number>;
	demand: Record<string, number>;
	training: number;
	latency: number;
	carbonCap: number | null;
}

export type Outcome =
	| {
			kind: "added";
			demand: string;
			site: string;
			mw: number;
			capped?: boolean;
	  }
	| { kind: "removed"; demand: string; site: string; mw: number }
	| { kind: "changed"; demand: string; site: string; mw: number }
	| { kind: "far"; demand: string; site: string; rtt: number }
	| { kind: "offline"; demand: string; site: string }
	| { kind: "full"; demand: string; site: string }
	| { kind: "served"; demand: string; site: string }
	| { kind: "carbon"; demand: string; site: string };

export interface Metrics {
	energy: number;
	lost: number;
	build: number;
	total: number;
	carbon: number;
	dropped: number;
	load: Record<string, number>;
	served: Record<string, number>;
}

export const key = (demand: string, site: string) => `${demand}>${site}`;

export function split(k: string): [string, string] {
	const at = k.indexOf(">");

	return [k.slice(0, at), k.slice(at + 1)];
}

const round = (mw: number) => Math.round(mw * 1e6) / 1e6;

export function kindOf(level: Level, id: string): NodeKind {
	if (id === TRAINING) return "training";

	return id in level.capacity ? "site" : "city";
}

export function siteOf(world: World, id: string): Site | undefined {
	return world.sites.find((s) => s.id === id);
}

export function totalBlocks(blocks: Record<string, number>): number {
	return Object.values(blocks).reduce((a, b) => a + b, 0);
}

export function sceneOf(level: Level, offline: string[] = []): Scene {
	const off = new Set(offline);

	return {
		capacity: Object.fromEntries(
			Object.entries(level.capacity).map(([s, mw]) => [s, off.has(s) ? 0 : mw]),
		),
		demand: { ...level.demand },
		training: level.training,
		latency: level.latency,
		carbonCap: level.carbonCap,
	};
}

function need(scene: Scene, demand: string): number {
	return demand === TRAINING ? scene.training : (scene.demand[demand] ?? 0);
}

export function rtt(world: World, demand: string, site: string): number {
	return demand === TRAINING ? 0 : (world.rtt[demand]?.[site] ?? Infinity);
}

export function reachable(
	world: World,
	scene: Scene,
	demand: string,
	site: string,
): boolean {
	return (
		(scene.capacity[site] ?? 0) > 0 && rtt(world, demand, site) <= scene.latency
	);
}

function carbonOf(world: World, site: string): number {
	return siteOf(world, site)?.carbon ?? 0;
}

function priceOf(world: World, site: string): number {
	return siteOf(world, site)?.price ?? 0;
}

function tally(routes: Routes) {
	const load: Record<string, number> = {};
	const served: Record<string, number> = {};

	for (const [k, mw] of Object.entries(routes)) {
		const [d, s] = split(k);

		load[s] = (load[s] ?? 0) + mw;
		served[d] = (served[d] ?? 0) + mw;
	}

	return { load, served };
}

function carbon(world: World, routes: Routes): number {
	return Object.entries(routes).reduce(
		(sum, [k, mw]) => sum + carbonOf(world, split(k)[1]) * mw,
		0,
	);
}

function room(
	world: World,
	scene: Scene,
	routes: Routes,
	demand: string,
	site: string,
): { mw: number; limit: "served" | "full" | "carbon" | null; capped: boolean } {
	const { load, served } = tally(routes);
	const left = need(scene, demand) - (served[demand] ?? 0);
	const free = (scene.capacity[site] ?? 0) - (load[site] ?? 0);
	const c = carbonOf(world, site);

	const budget =
		scene.carbonCap !== null && c > 0
			? (scene.carbonCap - carbon(world, routes)) / c
			: Infinity;

	const mw = round(Math.min(left, free, budget));
	const capped = budget < Math.min(left, free);

	if (mw > 0) return { mw, limit: null, capped };

	if (left <= 1e-9) return { mw: 0, limit: "served", capped };

	if (free <= 1e-9) return { mw: 0, limit: "full", capped };

	return { mw: 0, limit: "carbon", capped };
}

export function tap(
	world: World,
	scene: Scene,
	routes: Routes,
	demand: string,
	site: string,
): { routes: Routes; outcome: Outcome } {
	const k = key(demand, site);

	if (routes[k]) {
		const { [k]: mw, ...rest } = routes;

		return { routes: rest, outcome: { kind: "removed", demand, site, mw } };
	}

	if ((scene.capacity[site] ?? 0) <= 0)
		return { routes, outcome: { kind: "offline", demand, site } };

	if (!reachable(world, scene, demand, site))
		return {
			routes,
			outcome: { kind: "far", demand, site, rtt: rtt(world, demand, site) },
		};

	const { mw, limit, capped } = room(world, scene, routes, demand, site);

	if (limit) return { routes, outcome: { kind: limit, demand, site } };

	return {
		routes: { ...routes, [k]: mw },
		outcome: { kind: "added", demand, site, mw, ...(capped ? { capped } : {}) },
	};
}

export function step(
	world: World,
	scene: Scene,
	routes: Routes,
	demand: string,
	site: string,
	delta: number,
): { routes: Routes; outcome: Outcome } | null {
	const k = key(demand, site);
	const current = routes[k] ?? 0;
	let next: number;

	if (delta < 0) {
		if (!current) return null;

		next = Math.max(0, current + delta);
	} else {
		if (!reachable(world, scene, demand, site)) return null;

		const { mw, limit } = room(world, scene, routes, demand, site);

		if (limit) return { routes, outcome: { kind: limit, demand, site } };

		next = current + Math.min(delta, mw);
	}

	next = round(next);

	const { [k]: _, ...rest } = routes;

	return {
		routes: next ? { ...rest, [k]: next } : rest,
		outcome: { kind: "changed", demand, site, mw: next },
	};
}

export function measure(
	world: World,
	scene: Scene,
	routes: Routes,
	buildCost = 0,
): Metrics {
	const { load, served } = tally(routes);

	const energy = Object.entries(load).reduce(
		(sum, [s, mw]) => sum + priceOf(world, s) * mw,
		0,
	);

	const short = Object.entries(scene.demand).reduce(
		(sum, [c, mw]) => sum + Math.max(0, mw - (served[c] ?? 0)),
		0,
	);

	const shortTraining = Math.max(0, scene.training - (served[TRAINING] ?? 0));
	const lost =
		world.values.inference * short + world.values.training * shortTraining;

	return {
		energy,
		lost,
		build: buildCost,
		total: energy + lost + buildCost,
		carbon: carbon(world, routes),
		dropped: round(short + shortTraining),
		load,
		served,
	};
}

export function fromSolved(solved: Solved): Routes {
	const routes: Routes = {};

	for (const r of solved.routes) routes[key(r.city, r.site)] = r.mw;

	for (const t of solved.training) routes[key(TRAINING, t.site)] = t.mw;

	return routes;
}

export function fromStart(level: Level, offline: string[] = []): Routes {
	const off = new Set(offline);

	return Object.fromEntries(
		level.start
			.filter((r) => !off.has(r.site))
			.map((r) => [key(r.city, r.site), r.mw]),
	);
}

export function matched(yours: number, best: number): boolean {
	return yours <= best + Math.max(1, best * 1e-6);
}
