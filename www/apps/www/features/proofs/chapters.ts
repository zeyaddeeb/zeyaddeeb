import { levels } from "./levels";

export type Shape = "circle" | "square" | "triangle";

export interface Chapter {
	id: string;
	number: number;
	title: string;
	shape: Shape;
	color: "red" | "blue" | "yellow";
	levels: string[];
}

export const chapters: Chapter[] = [
	{
		id: "checking",
		number: 1,
		title: "Checking",
		shape: "circle",
		color: "red",
		levels: ["compute", "false", "exact"],
	},
	{
		id: "logic",
		number: 2,
		title: "Logic",
		shape: "square",
		color: "blue",
		levels: ["intro", "and", "or"],
	},
	{
		id: "numbers",
		number: 3,
		title: "Numbers",
		shape: "triangle",
		color: "yellow",
		levels: ["rewrite", "induction", "automate"],
	},
];

export interface Place {
	chapter: Chapter;
	part: number;
	parts: number;
}

export function place(index: number): Place {
	const id = levels[index]?.id;
	const chapter = chapters.find((c) => c.levels.includes(id)) ?? chapters[0];

	return {
		chapter,
		part: chapter.levels.indexOf(id) + 1,
		parts: chapter.levels.length,
	};
}

export function levelIndex(id: string): number {
	return levels.findIndex((level) => level.id === id);
}
