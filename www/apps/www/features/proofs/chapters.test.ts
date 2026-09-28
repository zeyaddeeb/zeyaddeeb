import { describe, expect, it } from "vitest";
import { chapters, levelIndex, place } from "./chapters";
import { levels } from "./levels";

describe("chapters", () => {
	it("hold every level exactly once, in order", () => {
		expect(chapters.flatMap((c) => c.levels)).toEqual(levels.map((l) => l.id));
	});

	it("place a level inside its chapter", () => {
		expect(place(0)).toMatchObject({ part: 1, parts: 3 });
		expect(place(levelIndex("or")).chapter.id).toBe("logic");
		expect(place(levelIndex("or")).part).toBe(3);
		expect(place(levels.length - 1).chapter.shape).toBe("triangle");
	});
});
