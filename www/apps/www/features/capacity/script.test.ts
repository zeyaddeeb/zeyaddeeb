import { describe, expect, it } from "vitest";
import { atlantic, carbon, world } from "./fixtures";
import { describe as describeOutcome, keyMove, verdict } from "./script";

describe("narrating a tap", () => {
	it("explains a route that is too far", () => {
		const line = describeOutcome(world, atlantic, {
			kind: "far",
			demand: "london",
			site: "ashburn",
			rtt: 85,
		});
		expect(line).toEqual({
			tone: "miss",
			text: "london can’t use ashburn: 85 ms is over the 80 ms limit.",
		});
	});

	it("says when a fill spent the carbon budget", () => {
		const line = describeOutcome(world, carbon, {
			kind: "added",
			demand: "berlin",
			site: "warsaw",
			mw: 34.8,
			capped: true,
		});
		expect(line.text).toContain("last of the carbon budget");
	});
});

describe("the verdict", () => {
	it("celebrates a match", () => {
		expect(verdict(7800, 7800, true)).toContain("matched");
	});

	it("measures the gap", () => {
		expect(verdict(15600, 7800, false)).toBe(
			"You paid $7,800 an hour more than the solver, 100% over.",
		);
	});
});

describe("the key move", () => {
	it("names the route and what banning it costs", () => {
		expect(
			keyMove(world, {
				demand: "london",
				site: "keflavik",
				mw: 40,
				worth: 52480,
			}),
		).toEqual({
			route: "keflavik → london",
			worth: "Ban it and the best plan costs $52,480 more an hour",
		});
	});
});
