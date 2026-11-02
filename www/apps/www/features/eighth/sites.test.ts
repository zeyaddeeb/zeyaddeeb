import { describe, expect, it } from "vitest";
import { choose, km, leastKm, lightMs, SITES } from "./sites";

const [dalles, ashburn, virginia] = SITES as [
	(typeof SITES)[0],
	(typeof SITES)[0],
	(typeof SITES)[0],
];

describe("sites", () => {
	it("puts Oregon and Ashburn twelve light milliseconds apart", () => {
		expect(km(dalles, ashburn)).toBeCloseTo(3620, -1);
		expect(lightMs(km(dalles, ashburn))).toBeCloseTo(12.08, 1);
		expect(leastKm(dalles, ashburn)).toBeGreaterThan(3600);
	});

	it("cannot tell the two Virginia sites apart", () => {
		expect(leastKm(ashburn, virginia)).toBe(0);
	});

	it("falls back to the widest live pair, west first", () => {
		const ids = (pair: ReturnType<typeof choose>) => pair?.map((s) => s.id);

		expect(ids(choose(SITES.map((s) => s.id)))).toEqual([
			"gcp-us-west1",
			"gcp-us-east4",
		]);
		expect(ids(choose(["aws-us-east-1", "gcp-us-west1"]))).toEqual([
			"gcp-us-west1",
			"aws-us-east-1",
		]);
		expect(ids(choose(["aws-us-east-1", "gcp-us-east4"]))).toEqual([
			"gcp-us-east4",
			"aws-us-east-1",
		]);
		expect(choose(["gcp-us-east4"])).toBeNull();
		expect(
			choose(
				["gcp-us-west1", "gcp-us-east4"],
				["gcp-us-east4", "aws-us-east-1"],
			),
		).toBeNull();
	});
});
