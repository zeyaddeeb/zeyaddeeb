export interface Referee {
	id: string;
	name: string;
	asks: string;
}

export const REFEREES: Referee[] = [
	{ id: "reach", name: "Reach", asks: "Can it get there?" },
	{ id: "kill", name: "Kill", asks: "Do the cells need it?" },
	{ id: "matter", name: "Matter", asks: "Does it show up in people?" },
	{ id: "later", name: "Later", asks: "What will the trials report?" },
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
