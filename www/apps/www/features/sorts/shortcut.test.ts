import { describe, expect, it } from "vitest";
import { heard, matched } from "./shortcut";

const press = (keys: string[]) =>
	keys.reduce<string[]>((typed, key) => heard(typed, key), []);

describe("home shortcut", () => {
	it("hears the word typed in order", () => {
		expect(matched(press([..."invade"]))).toBe(true);
		expect(matched(press([..."xxINVADE"]))).toBe(true);
		expect(matched(press([..."invad"]))).toBe(false);
		expect(matched(press([..."invaded"]))).toBe(false);
	});

	it("hears up, right, right, right on the arrow keys", () => {
		const up = "ArrowUp";
		const right = "ArrowRight";

		expect(matched(press([up, right, right, right]))).toBe(true);
		expect(
			matched(press(["ArrowDown", up, "Shift", right, right, right])),
		).toBe(true);
		expect(matched(press([up, right, right]))).toBe(false);
		expect(matched(press([right, up, right, right]))).toBe(false);
		expect(matched(press([up, right, "ArrowLeft", right, right]))).toBe(false);
	});
});
