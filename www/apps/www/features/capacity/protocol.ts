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

export interface Hub {
	id: string;
	name: string;
	lat: number;
	lon: number;
	price: number;
	capacity: number;
}

export interface Substation {
	id: string;
	name: string;
	place: string;
	lat: number;
	lon: number;
	load: number;
	land: number;
}

export interface GridLine {
	id: string;
	a: string;
	b: string;
	km: number;
	limit: number;
	cost: number;
}

export interface Campus {
	id: string;
	mw: number;
}

export interface GridLevel {
	id: string;
	campuses: Campus[];
	placement: Record<string, string> | null;
	candidates: string[];
	maxBuild: number;
	switching: boolean;
	lure: [string, string] | null;
	hubCapacity: Record<string, number>;
	prices: boolean;
}

export interface GridWorld {
	hubs: Hub[];
	substations: Substation[];
	lines: GridLine[];
	candidates: GridLine[];
	levels: GridLevel[];
	values: { shed: number; buildPerKm: number };
}

export interface GridChoice {
	placement?: Record<string, string>;
	built?: string[];
	opened?: string[];
}

export interface GridEdits {
	tripped?: string[];
	demand?: number;
}

export interface GridKey {
	kind: "site" | "open";
	campus: string | null;
	substation: string | null;
	line: string | null;
	worth: number;
}

export interface GridFlow {
	placement: Record<string, string>;
	built: string[];
	opened: string[];
	flows: Record<string, number>;
	supply: Record<string, number>;
	shed: Record<string, number>;
	binding: string[];
}

export interface TraceStep {
	ms: number;
	total: number;
	bound: number | null;
	nodes: number;
	flow: GridFlow;
}

export interface GridSolved extends GridFlow {
	totals: {
		energy: number;
		lost: number;
		land: number;
		build: number;
		total: number;
		served: number;
		demand: number;
	};
	key: GridKey | null;
	candidates: Record<string, number>;
	prices: Record<string, number>;
	trace: TraceStep[];
	solver: {
		engine: string;
		variables: number;
		constraints: number;
		nodes: number;
		ms: number;
	};
}

export interface Project {
	id: string;
	kind: "hub" | "upgrade" | "line" | "turbine" | "plant";
	target: string;
	mw: number;
	lead: number;
	cost: number;
	fuel: number;
	blocks: number;
}

export interface PlanCase {
	id: string;
	label: string;
	weight: number;
	period: number;
	campuses: [string, number][];
}

export interface PlanLevel {
	id: string;
	cases: PlanCase[];
	projects: string[];
	periods: number;
	crews: number;
	budget: number | null;
	objective: "expected" | "worst";
	rentals: string[];
	recourse: boolean;
	switching: boolean;
}

export interface PlansWorld {
	projects: Project[];
	levels: PlanLevel[];
}

export interface Schedule {
	starts: { project: string; period: number; count: number }[];
	rentals: { project: string; case: string; blocks: number }[];
	opened: { line: string; case: string }[];
}

export interface CaseResult {
	case: string;
	flow: GridFlow;
	rentals: Record<string, number>;
	energy: number;
	lost: number;
	turbines: number;
	build: number;
	total: number;
}

export interface PlanStep {
	ms: number;
	total: number;
	bound: number | null;
	nodes: number;
	schedule: Schedule;
	cases: CaseResult[];
}

export interface Hedge {
	meanSize: number;
	meanTotal: number;
	vss: number;
	perfect: number;
	evpi: number;
	otherSize: number;
	otherTotal: number;
	otherWorst: number;
}

export interface PlanSolved {
	schedule: Schedule;
	cases: CaseResult[];
	total: number;
	worst: number;
	key: {
		kind: "start" | "rent" | "open";
		project: string;
		period: number | null;
		worth: number;
	} | null;
	hedge: Hedge | null;
	trace: PlanStep[];
	solver: GridSolved["solver"];
}
