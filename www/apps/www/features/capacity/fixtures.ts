import type { Level, World } from "./protocol";

const site = (id: string, price: number, carbon: number) => ({
	id,
	name: id,
	place: id,
	lat: 0,
	lon: 0,
	price,
	carbon,
});

const city = (id: string) => ({ id, name: id, lat: 0, lon: 0 });

export const world: World = {
	sites: [
		site("ashburn", 88, 0.34),
		site("keflavik", 42, 0.01),
		site("lulea", 45, 0.025),
		site("dublin", 155, 0.26),
		site("frankfurt", 165, 0.36),
		site("madrid", 95, 0.12),
		site("warsaw", 120, 0.66),
		site("quebec", 48, 0.01),
		site("abilene", 52, 0.37),
	],
	cities: ["newyork", "toronto", "chicago", "london", "paris", "berlin"].map(
		city,
	),
	levels: [],
	rtt: {
		newyork: { ashburn: 7, keflavik: 60, quebec: 9, abilene: 36 },
		toronto: { ashburn: 10, keflavik: 60, quebec: 9, abilene: 32 },
		chicago: { ashburn: 15, quebec: 18, abilene: 23 },
		london: {
			ashburn: 85,
			keflavik: 29,
			lulea: 30,
			dublin: 8,
			frankfurt: 11,
			madrid: 20,
			warsaw: 22,
		},
		paris: { lulea: 33, dublin: 13, frankfurt: 9, madrid: 17, warsaw: 21 },
		berlin: { lulea: 23, dublin: 20, frankfurt: 8, madrid: 28, warsaw: 9 },
	},
	values: { inference: 1400, training: 500, upgradeMw: 10 },
};

export const level = (patch: Partial<Level>): Level => ({
	id: "test",
	capacity: {},
	demand: {},
	latency: 80,
	training: 0,
	carbonCap: null,
	outage: null,
	start: [],
	build: null,
	...patch,
});

export const atlantic = level({
	capacity: { ashburn: 60, keflavik: 60 },
	demand: { newyork: 50, toronto: 30, london: 40 },
});

export const carbon = level({
	capacity: { lulea: 40, dublin: 60, frankfurt: 70, madrid: 50, warsaw: 60 },
	demand: { london: 50, paris: 40, berlin: 50 },
	latency: 40,
	carbonCap: 30,
});

export const outage = level({
	capacity: { ashburn: 80, quebec: 100, abilene: 50 },
	demand: { newyork: 70, toronto: 30, chicago: 30 },
	latency: 30,
	outage: "ashburn",
	start: [
		{ city: "newyork", site: "ashburn", mw: 70 },
		{ city: "toronto", site: "quebec", mw: 30 },
		{ city: "chicago", site: "quebec", mw: 30 },
	],
});

export const build = level({
	capacity: { ashburn: 60, keflavik: 30 },
	demand: { newyork: 80, london: 60 },
	build: { block: 25, cost: 900, blocks: 2 },
});
