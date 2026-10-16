import type { FormId } from "./forms";

export interface Laid {
	pin: [number, number, number];
	grain: number;
}

export interface Best {
	fill: number;
	pieces: number;
	coverage: number;
	layout: Laid[];
}

export const RECORDS: Record<FormId, Best[]> = {
	ball: [
		{ fill: 0, pieces: 1, coverage: 1, layout: [{ pin: [0, 0, 1], grain: 0 }] },
		{
			fill: 0.5,
			pieces: 2,
			coverage: 1,
			layout: [
				{ pin: [0, 0, 1], grain: 0 },
				{ pin: [0, 0, -1], grain: 45 },
			],
		},
		{
			fill: 0.7,
			pieces: 2,
			coverage: 1,
			layout: [
				{ pin: [0, 0, 1], grain: 0 },
				{ pin: [0, 0, -1], grain: 45 },
			],
		},
		{
			fill: 0.8,
			pieces: 2,
			coverage: 0.99988,
			layout: [
				{ pin: [0, 0, 1], grain: 0 },
				{ pin: [0, 0, -1], grain: 45 },
			],
		},
		{
			fill: 0.866,
			pieces: 3,
			coverage: 0.99725,
			layout: [
				{ pin: [-0.39272, -0.14344, 0.9084], grain: 22.41 },
				{ pin: [-0.8599, -0.51039, 0.0085], grain: 90.2 },
				{ pin: [0.62737, 0.52944, -0.57105], grain: 134.96 },
			],
		},
		{
			fill: 0.9,
			pieces: 4,
			coverage: 0.99825,
			layout: [
				{ pin: [0.57735, 0.57735, 0.57735], grain: 0 },
				{ pin: [0.57735, -0.57735, -0.57735], grain: 45 },
				{ pin: [-0.57735, 0.57735, -0.57735], grain: 0 },
				{ pin: [-0.57735, -0.57735, 0.57735], grain: 45 },
			],
		},
	],
	saddle: [
		{
			fill: 0,
			pieces: 1,
			coverage: 0.99975,
			layout: [{ pin: [0, 0, 0], grain: 0 }],
		},
		{
			fill: 0.5,
			pieces: 1,
			coverage: 0.99975,
			layout: [{ pin: [0, 0, 0], grain: 0 }],
		},
		{
			fill: 0.7,
			pieces: 1,
			coverage: 0.99975,
			layout: [{ pin: [0, 0, 0], grain: 0 }],
		},
		{
			fill: 0.8,
			pieces: 2,
			coverage: 0.9995,
			layout: [
				{ pin: [0.3405, -0.75239, -0.36012], grain: -12.77 },
				{ pin: [-0.15953, 0.64852, -0.3161], grain: 159.26 },
			],
		},
		{
			fill: 0.866,
			pieces: 3,
			coverage: 0.99888,
			layout: [
				{ pin: [0.02562, 0.50951, -0.20716], grain: 28.97 },
				{ pin: [0.95083, 0.10401, 0.71461], grain: 136.54 },
				{ pin: [0.31272, -0.51969, -0.13783], grain: 179.58 },
			],
		},
		{
			fill: 0.9,
			pieces: 3,
			coverage: 0.99963,
			layout: [
				{ pin: [1.11599, -0.2627, 0.94115], grain: 21.77 },
				{ pin: [-0.62901, -0.03843, 0.31534], grain: 138.2 },
				{ pin: [0.64148, -0.21746, 0.29137], grain: 111.65 },
			],
		},
	],
	bagel: [
		{
			fill: 0,
			pieces: 2,
			coverage: 0.99875,
			layout: [
				{ pin: [1.5, 0, 0], grain: -113.64 },
				{ pin: [-0.5, 0, 0], grain: -68.22 },
			],
		},
		{
			fill: 0.5,
			pieces: 2,
			coverage: 0.99925,
			layout: [
				{ pin: [1.33401, 0.18243, -0.36054], grain: -117.54 },
				{ pin: [-0.49168, 0.18429, 0.15636], grain: -90 },
			],
		},
		{
			fill: 0.7,
			pieces: 3,
			coverage: 0.99988,
			layout: [
				{ pin: [0.65618, -1.09056, -0.41906], grain: 121.27 },
				{ pin: [-0.6219, 1.222, -0.33503], grain: 40.24 },
				{ pin: [1.32616, 0.44554, -0.30132], grain: 21.6 },
			],
		},
		{
			fill: 0.8,
			pieces: 3,
			coverage: 0.99813,
			layout: [
				{ pin: [1.29781, 0.71162, 0.13963], grain: 124.6 },
				{ pin: [0.19895, -0.62063, 0.35876], grain: -15.18 },
				{ pin: [-1.37544, -0.09108, -0.32676], grain: 27.96 },
			],
		},
		{
			fill: 0.866,
			pieces: 4,
			coverage: 0.99875,
			layout: [
				{ pin: [-0.46077, 1.40906, 0.13117], grain: 38.36 },
				{ pin: [0.97855, 1.13653, 0.01584], grain: 146.28 },
				{ pin: [-0.4518, -0.26293, 0.14905], grain: 133.42 },
				{ pin: [0.25571, -0.51985, -0.27026], grain: 7.86 },
			],
		},
		{
			fill: 0.9,
			pieces: 5,
			coverage: 0.99763,
			layout: [
				{ pin: [-1.36769, -0.52837, 0.18072], grain: 103.81 },
				{ pin: [-0.67094, 1.24698, -0.27735], grain: 103.47 },
				{ pin: [0.51106, -0.28113, -0.27631], grain: 93.28 },
				{ pin: [-0.57138, -0.63963, 0.47931], grain: 144.28 },
				{ pin: [1.31176, -0.08289, 0.3888], grain: 24.68 },
			],
		},
	],
};
