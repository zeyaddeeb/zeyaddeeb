export interface Site {
	id: string;
	name: string;
	place: string;
	lat: number;
	lon: number;
	price: number;
	carbon: number;
}

export interface City {
	id: string;
	name: string;
	lat: number;
	lon: number;
}

export interface Route {
	city: string;
	site: string;
	mw: number;
}

export interface Level {
	id: string;
	capacity: Record<string, number>;
	demand: Record<string, number>;
	latency: number;
	training: number;
	carbonCap: number | null;
	outage: string | null;
	start: Route[];
	build: { block: number; cost: number; blocks: number } | null;
}

export interface World {
	sites: Site[];
	cities: City[];
	levels: Level[];
	rtt: Record<string, Record<string, number>>;
	values: { inference: number; training: number; upgradeMw: number };
}

export interface Edits {
	offline?: string[];
	latency?: number;
	demand?: number;
	build?: Record<string, number>;
}

export interface Totals {
	energy: number;
	lost: number;
	build: number;
	total: number;
	carbon: number;
	served: number;
	demand: number;
}

export interface KeyMove {
	demand: string;
	site: string;
	mw: number;
	worth: number;
}

export interface Solved {
	routes: Route[];
	training: { site: string; mw: number }[];
	dropped: Record<string, number>;
	droppedTraining: number;
	build: Record<string, number>;
	totals: Totals;
	key: KeyMove | null;
	upgrades: Record<string, number>;
	duals: Record<string, number>;
	carbonPrice: number | null;
	carbonDual: number | null;
	buildAllCost: number | null;
	solver: {
		engine: string;
		variables: number;
		constraints: number;
		iterations: number;
		ms: number;
	};
}
