import { describe, expect, it } from "vitest";
import { dialDrag } from "./dial-drag";

const center = { x: 80, y: 80 };
const radius = 80;
const point = (degrees: number) => ({
	x: center.x + 60 * Math.cos((degrees * Math.PI) / 180),
	y: center.y + 60 * Math.sin((degrees * Math.PI) / 180),
});

describe("dial gestures", () => {
	it("keeps turning clockwise through a full circle instead of cancelling out", () => {
		let degrees = 0;
		for (let angle = -90; angle < 270; angle += 15) {
			degrees += dialDrag(
				point(angle),
				point(angle + 15),
				center,
				radius,
				true,
			);
		}
		expect(degrees).toBeCloseTo(360);
	});

	it("crosses the angle seam in either direction without a large jump", () => {
		expect(dialDrag(point(179), point(-179), center, radius, true)).toBeCloseTo(
			2,
		);
		expect(dialDrag(point(-179), point(179), center, radius, true)).toBeCloseTo(
			-2,
		);
	});

	it("ignores angular movement in and out of the hub", () => {
		expect(dialDrag(point(0), center, center, radius, true)).toBe(0);
		expect(dialDrag(center, point(180), center, radius, true)).toBe(0);
	});

	it("supports a straight drag started in the center", () => {
		expect(dialDrag(center, { x: 105, y: 80 }, center, radius, false)).toBe(30);
		expect(dialDrag(center, { x: 80, y: 55 }, center, radius, false)).toBe(30);
		expect(dialDrag(center, { x: 80, y: 105 }, center, radius, false)).toBe(
			-30,
		);
	});
});
