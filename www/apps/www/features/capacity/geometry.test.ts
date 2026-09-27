import { describe, expect, it } from "vitest";
import { atlantic, world } from "./fixtures";
import {
	labels,
	layout,
	type MapNode,
	octilinear,
	placeCallout,
	planTracks,
	wedge,
} from "./geometry";
import type { World } from "./protocol";

const placed: World = {
	...world,
	sites: world.sites.map((s) =>
		s.id === "ashburn"
			? { ...s, lat: 39.04, lon: -77.49 }
			: s.id === "keflavik"
				? { ...s, lat: 63.99, lon: -22.62 }
				: s,
	),
	cities: world.cities.map((c) =>
		c.id === "newyork"
			? { ...c, lat: 40.71, lon: -74.01 }
			: c.id === "toronto"
				? { ...c, lat: 43.65, lon: -79.38 }
				: c.id === "london"
					? { ...c, lat: 51.51, lon: -0.13 }
					: c,
	),
};

const inset = { top: 56, right: 0, bottom: 40, left: 0 };

describe("octilinear tracks", () => {
	it("runs straight, then bends 45 degrees into the target", () => {
		const track = octilinear({ x: 0, y: 0 }, { x: 100, y: 40 });
		expect(track.d).toContain("Q60.0 0.0");
		expect(track.length).toBeCloseTo(60 + 40 * Math.SQRT2);
	});

	it("labels the longer leg", () => {
		expect(octilinear({ x: 0, y: 0 }, { x: 100, y: 40 }).mid).toEqual({
			x: 30,
			y: 0,
		});
	});

	it("draws a straight line when no bend is needed", () => {
		expect(octilinear({ x: 0, y: 0 }, { x: 50, y: 50 }).d).toBe(
			"M0.0 0.0L50.0 50.0",
		);
	});
});

describe("layout", () => {
	const { nodes } = layout(placed, atlantic, 800, 480, inset);

	it("keeps every node clear of the edges and overlays", () => {
		for (const n of nodes) {
			expect(n.x).toBeGreaterThanOrEqual(24);
			expect(n.x).toBeLessThanOrEqual(800 - 24);
			expect(n.y).toBeGreaterThanOrEqual(inset.top);
			expect(n.y).toBeLessThanOrEqual(480 - inset.bottom);
		}
	});

	it("pushes neighbors apart so each can be tapped", () => {
		for (const a of nodes)
			for (const b of nodes)
				if (a !== b)
					expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(40);
	});

	it("keeps west to the left", () => {
		const x = (id: string) => nodes.find((n) => n.id === id)?.x ?? 0;
		expect(x("toronto")).toBeLessThan(x("keflavik"));
		expect(x("keflavik")).toBeLessThan(x("london"));
	});
});

describe("labels", () => {
	it("stay inside the map", () => {
		const { nodes } = layout(placed, atlantic, 390, 340, inset);
		for (const label of labels(nodes, true, 390, 340, inset)) {
			expect(label.ly).toBeGreaterThan(inset.top);
			expect(label.ly).toBeLessThan(340);
		}
	});
});

describe("labels on a short map", () => {
	it("never run past the bottom edge", () => {
		const height = 283;
		const { nodes } = layout(placed, atlantic, 560, height, inset);
		for (const label of labels(nodes, false, 560, height, inset)) {
			const bottom = label.ly + (label.detail ? 14 : 0);
			expect(bottom).toBeLessThanOrEqual(height - 4);
		}
	});
});

describe("planning tracks", () => {
	const node = (id: string, x: number, y: number): MapNode => ({
		id,
		kind: "site",
		title: id,
		x,
		y,
	});
	const a = node("a", 0, 0);
	const b = node("b", 200, 80);

	it("bends around a station sitting on the direct track", () => {
		const blocker = node("c", 60, 0);
		const tracks = planTracks([{ key: "a>b", a, b }], [a, b, blocker]);
		expect(tracks.get("a>b")?.d).not.toBe(octilinear(a, b, "early").d);
	});

	it("keeps two tracks from sharing a leg", () => {
		const c = node("c", 200, 100);
		const tracks = planTracks(
			[
				{ key: "a>b", a, b },
				{ key: "a>c", a, b: c },
			],
			[a, b, c],
		);
		const shapes = [tracks.get("a>b"), tracks.get("a>c")].map(
			(t) => t?.d.split("Q")[0],
		);
		expect(shapes[0]).not.toBe(shapes[1]);
	});
});

describe("the key move callout", () => {
	const map = { width: 400, height: 360 };
	const box = { width: 200, height: 90 };
	const a = { x: 100, y: 150 };
	const b = { x: 300, y: 150 };
	const track = octilinear(a, b);

	it("sits beside the route when nothing is in the way", () => {
		const spot = placeCallout([], track, [a, b], box, map, inset);
		expect(spot).toEqual({ x: 100, y: 172 });
	});

	it("moves when that spot would hide a station", () => {
		const station = {
			id: "x",
			kind: "city" as const,
			title: "X",
			x: 200,
			y: 210,
		};
		const spot = placeCallout([station], track, [a, b], box, map, inset);
		const hides =
			station.x > spot.x &&
			station.x < spot.x + box.width &&
			station.y > spot.y &&
			station.y < spot.y + box.height;
		expect(hides).toBe(false);
	});
});

describe("served wedge", () => {
	it("is empty at zero and a full circle when served", () => {
		expect(wedge(8, 0)).toBe("");
		expect(wedge(8, 1)).toContain("a8 8");
	});
});
