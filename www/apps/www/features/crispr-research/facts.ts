export interface Referee {
	id: string;
	name: string;
	asks: string;
	scores: boolean;
	gate: string;
}

export const REFEREES: Referee[] = [
	{
		id: "reach",
		name: "Reach",
		asks: "Can it get there?",
		scores: false,
		gate: "reproduces a published model; nine measurements could not test it",
	},
	{
		id: "kill",
		name: "Kill",
		asks: "Do the cells need it?",
		scores: true,
		gate: "separates known essentials from known non-essentials at 0.9991",
	},
	{
		id: "matter",
		name: "Matter",
		asks: "Does it show up in people?",
		scores: true,
		gate: "sees checkpoint drugs run 5x longer in MSI colorectal cancer",
	},
	{
		id: "later",
		name: "Later",
		asks: "What will the trials report?",
		scores: true,
		gate: "reads the registry; a bet on an unreported trial is left open",
	},
];

export const KILL_GATE = {
	lines: 63,
	essentials: 1523,
	controls: 726,
	auroc: 0.9991,
};

export const MATTER_GATE = {
	ratio: 5.07,
	p: "8 x 10^-11",
	control: 0.85,
};
