import { type Experiment, getExperiment } from "../catalog/catalog";

export const shapes = [
	"block",
	"sun",
	"moon",
	"slab",
	"core",
	"line",
	"dot",
] as const;

export type Shape = (typeof shapes)[number];

export type Color = "ink" | "paper" | "red" | "blue" | "yellow" | "none";

export type Kind =
	| "rect"
	| "round"
	| "tri"
	| "arch"
	| "quarter"
	| "semi"
	| "halo"
	| "arc";

export type Pattern = "lines" | "bars" | "sunset" | "rays" | "dots" | "ruler";

export interface Form {
	x: number;
	y: number;
	w: number;
	h: number;
	c: Color;
	r?: number;
	k?: Kind;
	p?: Pattern;
	q?: Color;
}

type Forms = Record<Shape, Form>;

export interface Spot {
	x: number;
	y: number;
	w: number;
	r?: number;
	v?: number;
	tone: "ink" | "paper";
	align?: "left" | "center";
	stop?: Color;
}

export interface Labels {
	title: Spot;
	line: Spot;
}

export interface Scene {
	experiment: Experiment;
	blend?: boolean;
	caret?: boolean;
	land: Forms;
	port: Forms;
	labels: { land: Labels; port: Labels };
}

const landOff: Forms = {
	block: { x: 20, y: -4, w: 14, h: 14, c: "ink" },
	sun: { x: 14, y: 1, w: 4, h: 4, c: "yellow", k: "round" },
	moon: { x: 14, y: 2, w: 1, h: 1, c: "yellow", k: "round" },
	slab: { x: 14, y: 3, w: 2, h: 2, c: "red" },
	core: { x: 14, y: 4, w: 1, h: 1, c: "ink" },
	line: { x: 14, y: 5, w: 4, h: 0.06, c: "ink" },
	dot: { x: 14, y: 1, w: 0.6, h: 0.6, c: "red", k: "round" },
};

const portOff: Forms = {
	block: { x: -4, y: 16, w: 14, h: 6.7, c: "ink" },
	sun: { x: 1, y: 14, w: 3.4, h: 3.4, c: "yellow", k: "round" },
	moon: { x: 2, y: 14, w: 1, h: 1, c: "yellow", k: "round" },
	slab: { x: 3, y: 14, w: 2, h: 2, c: "red" },
	core: { x: 4, y: 14, w: 1, h: 1, c: "ink" },
	line: { x: 0, y: 14, w: 6, h: 0.05, c: "ink" },
	dot: { x: 5, y: 14, w: 0.5, h: 0.5, c: "red", k: "round" },
};

function scene(
	id: string,
	land: Partial<Forms>,
	port: Partial<Forms>,
	labels: { land: Labels; port: Labels },
	options: { blend?: boolean; caret?: boolean } = {},
): Scene {
	const tint = (off: Forms, on: Partial<Forms>) =>
		Object.fromEntries(
			shapes.map((shape) => [shape, on[shape] ?? off[shape]]),
		) as Forms;
	return {
		experiment: getExperiment(id),
		...options,
		land: tint(landOff, land),
		port: tint(portOff, port),
		labels,
	};
}

export const scenes: Scene[] = [
	scene(
		"proofs",
		{
			block: { x: 5.6, y: -4, w: 14, h: 14, c: "ink" },
			sun: {
				x: 6.4,
				y: 0.35,
				w: 4.2,
				h: 4.2,
				c: "yellow",
				k: "round",
				p: "sunset",
				q: "ink",
			},
			line: { x: 5.6, y: 4.75, w: 14, h: 0.05, c: "paper" },
			slab: { x: 10.75, y: 5.02, w: 0.36, h: 0.36, c: "red" },
		},
		{
			block: { x: -4, y: 2.7, w: 14, h: 6.7, c: "ink" },
			sun: {
				x: 0.9,
				y: 3.3,
				w: 3.4,
				h: 3.4,
				c: "yellow",
				k: "round",
				p: "sunset",
				q: "ink",
			},
			line: { x: -4, y: 7.55, w: 14, h: 0.05, c: "paper" },
			slab: { x: 5.2, y: 7.86, w: 0.3, h: 0.3, c: "red" },
		},
		{
			land: {
				title: {
					x: 6.9,
					y: 2.45,
					w: 3.2,
					v: 0.5,
					tone: "ink",
					align: "center",
				},
				line: { x: 5.95, y: 4.98, w: 4.6, tone: "paper" },
			},
			port: {
				title: { x: 1.1, y: 5, w: 3, v: 0.5, tone: "ink", align: "center" },
				line: { x: 0.3, y: 7.8, w: 4.6, tone: "paper" },
			},
		},
	),
	scene(
		"deepseek",
		{
			block: { x: 5.6, y: -4, w: 14, h: 14, c: "yellow" },
			sun: {
				x: 7.6,
				y: 1,
				w: 4.8,
				h: 4.8,
				c: "blue",
				k: "round",
				p: "rays",
				q: "ink",
			},
			moon: { x: 8.5, y: 1.9, w: 3, h: 3, c: "paper", k: "round" },
			dot: { x: 9.4, y: 2.8, w: 1.2, h: 1.2, c: "red", k: "round" },
			line: { x: 9.64, y: 0.93, w: 5, h: 0.05, c: "ink", r: -50 },
			core: { x: 10.39, y: 2.73, w: 0.28, h: 0.28, c: "ink", r: 45 },
		},
		{
			block: { x: -4, y: 2.7, w: 14, h: 6.7, c: "yellow" },
			sun: {
				x: 2.6,
				y: 5,
				w: 3.2,
				h: 3.2,
				c: "blue",
				k: "round",
				p: "rays",
				q: "ink",
			},
			moon: { x: 3.2, y: 5.6, w: 2, h: 2, c: "paper", k: "round" },
			dot: { x: 3.8, y: 6.2, w: 0.8, h: 0.8, c: "red", k: "round" },
			line: { x: 3.84, y: 4.695, w: 4, h: 0.05, c: "ink", r: -50 },
			core: { x: 4.41, y: 6.11, w: 0.26, h: 0.26, c: "ink", r: 45 },
		},
		{
			land: {
				title: { x: 6, y: 0.6, w: 1.95, tone: "ink" },
				line: { x: 6, y: 5.8, w: 1.85, v: 1, tone: "ink" },
			},
			port: {
				title: { x: 0.3, y: 3, w: 3.6, tone: "ink" },
				line: { x: 0.3, y: 8.35, w: 5.4, tone: "ink" },
			},
		},
	),
	scene(
		"wes-anderson",
		{
			block: { x: 5.6, y: -4, w: 14, h: 14, c: "red" },
			slab: { x: 6.4, y: 0.9, w: 4.8, h: 4.8, c: "yellow" },
			core: { x: 7.2, y: 2, w: 3.2, h: 3.2, c: "blue" },
			line: { x: 8, y: 3.1, w: 1.6, h: 1.6, c: "ink", p: "bars" },
		},
		{
			block: { x: -4, y: 2.7, w: 14, h: 6.7, c: "red" },
			slab: { x: 0.7, y: 4.1, w: 4.6, h: 4.6, c: "yellow" },
			core: { x: 1.5, y: 5.2, w: 3, h: 3, c: "blue" },
			line: { x: 2.3, y: 6.3, w: 1.4, h: 1.4, c: "ink", p: "bars" },
		},
		{
			land: {
				title: {
					x: 6.4,
					y: 1.45,
					w: 4.8,
					v: 0.5,
					tone: "ink",
					align: "center",
				},
				line: {
					x: 7.35,
					y: 2.55,
					w: 2.9,
					v: 0.5,
					tone: "paper",
					align: "center",
				},
			},
			port: {
				title: {
					x: 0.3,
					y: 3.4,
					w: 5.4,
					v: 0.5,
					tone: "ink",
					align: "center",
					stop: "yellow",
				},
				line: {
					x: 0.3,
					y: 3.4,
					w: 5.4,
					v: 0.5,
					tone: "paper",
					align: "center",
				},
			},
		},
	),
	scene(
		"portfolio",
		{
			line: { x: 4.3, y: 3.165, w: 9, h: 0.07, c: "ink", r: -24 },
			slab: { x: 5.6, y: 0.45, w: 1.9, h: 1.9, c: "red", r: -24 },
			sun: { x: 9.4, y: 3.4, w: 3, h: 3, c: "blue", k: "round", p: "dots" },
			block: { x: 6.3, y: 4.35, w: 2.4, h: 1.2, c: "yellow", r: -24 },
			core: { x: 5.2, y: 5.3, w: 0.55, h: 0.55, c: "ink", r: -24 },
			dot: { x: 8.9, y: 5.5, w: 0.4, h: 0.4, c: "red", k: "round" },
		},
		{
			line: { x: -1.2, y: 6.1, w: 8.4, h: 0.07, c: "ink", r: -30 },
			slab: { x: 0.4, y: 3, w: 2, h: 2, c: "red", r: -30 },
			sun: { x: 3.9, y: 2.7, w: 2.4, h: 2.4, c: "blue", k: "round", p: "dots" },
			block: { x: 0.3, y: 7.4, w: 2.2, h: 1.1, c: "yellow", r: -30 },
			core: { x: 2.9, y: 8.8, w: 0.5, h: 0.5, c: "ink", r: -30 },
			dot: { x: 5.2, y: 6.6, w: 0.35, h: 0.35, c: "red", k: "round" },
		},
		{
			land: {
				title: {
					x: 6.53,
					y: 3.05,
					w: 4.2,
					v: 1,
					r: -24,
					tone: "ink",
					align: "center",
				},
				line: { x: 9.2, y: 0.45, w: 2, tone: "ink" },
			},
			port: {
				title: {
					x: 1.2,
					y: 5.95,
					w: 3.2,
					v: 1,
					r: -30,
					tone: "ink",
					align: "center",
				},
				line: { x: 3, y: 7.7, w: 2.7, tone: "ink" },
			},
		},
		{ blend: true },
	),
	scene(
		"compute-crunch",
		{
			sun: { x: 6, y: 0.4, w: 4, h: 4, c: "red", k: "round" },
			moon: { x: 8.4, y: 0.8, w: 4, h: 4, c: "blue", k: "round", p: "lines" },
			dot: { x: 8.95, y: 2.35, w: 0.5, h: 0.5, c: "yellow", k: "round" },
			line: { x: 5.9, y: 5.62, w: 5.3, h: 0.14, c: "ink", p: "ruler" },
		},
		{
			sun: { x: 0.2, y: 2.7, w: 3.8, h: 3.8, c: "red", k: "round" },
			moon: { x: 2, y: 4.6, w: 3.8, h: 3.8, c: "blue", k: "round", p: "lines" },
			dot: { x: 2.75, y: 5.3, w: 0.5, h: 0.5, c: "yellow", k: "round" },
			line: { x: 0.3, y: 9.14, w: 5.4, h: 0.12, c: "ink", p: "ruler" },
		},
		{
			land: {
				title: {
					x: 6.35,
					y: 2.4,
					w: 1.95,
					v: 0.5,
					tone: "paper",
					stop: "yellow",
				},
				line: { x: 5.9, y: 5.6, w: 5.3, v: 1, tone: "ink" },
			},
			port: {
				title: {
					x: 0.8,
					y: 4.4,
					w: 2.6,
					v: 0.5,
					tone: "paper",
					stop: "yellow",
				},
				line: { x: 0.3, y: 9.1, w: 5.4, v: 1, tone: "ink" },
			},
		},
		{ blend: true, caret: true },
	),
];
