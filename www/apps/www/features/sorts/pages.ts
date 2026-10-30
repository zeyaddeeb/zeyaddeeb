export const pages: string[][] = [
	["oh hi", "who am i"],
	["ahoy", "hold on", "not today"],
	["oh my", "up up", "and away"],
	["much ado", "about", "a dot"],
	["a moth", "on a lamp"],
	["mind thy p", "and thy q"],
	["only you", "and i"],
];

export const impressions = ["First", "Second", "Third", "Fourth", "Fifth"];

export function sheet(run: number) {
	return {
		lines: pages[run % pages.length] ?? [],
		page: (run % pages.length) + 1,
		impression: Math.floor(run / pages.length),
	};
}

export const impressionOf = (index: number) =>
	impressions[index] ?? `${index + 1}th`;
