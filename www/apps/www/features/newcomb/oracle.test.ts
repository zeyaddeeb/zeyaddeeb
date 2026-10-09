import { describe, expect, it } from "vitest";
import { forecast, steady, type Take } from "./oracle";

const takes = (s: string) => [...s].map((c) => Number(c) as Take);

describe("oracle", () => {
	it("trusts an empty history", () => {
		expect(forecast([])).toEqual({ take: 1, reading: null });
	});

	it("repeats a single choice", () => {
		expect(forecast(takes("2")).take).toBe(2);
		expect(forecast(takes("1")).take).toBe(1);
	});

	it("reads the longest context that decides", () => {
		const f = forecast(takes("12121212"));

		expect(f.take).toBe(1);
		expect(f.reading?.order).toBe(5);
		expect(f.reading?.seen).toBe(1);
		expect(f.reading?.after).toEqual([6]);
	});

	it("backs off when a context ties", () => {
		const f = forecast(takes("1121"));

		expect(f.reading?.order).toBe(0);
		expect(f.take).toBe(1);
	});

	it("catches an alternator after a few rounds", () => {
		const history: Take[] = [];
		let right = 0;

		for (let i = 0; i < 40; i++) {
			const take: Take = i % 2 ? 2 : 1;

			if (forecast(history).take === take) right++;
			history.push(take);
		}

		expect(right).toBeGreaterThanOrEqual(37);
	});

	it("fills B for a steady one-boxer and empties it for a two-boxer", () => {
		expect(steady(1, 6)).toEqual([1, 1, 1, 1, 1, 1]);
		expect(steady(2, 6)).toEqual([1, 2, 2, 2, 2, 2]);
	});
});
