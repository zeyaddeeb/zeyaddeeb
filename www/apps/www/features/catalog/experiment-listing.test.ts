import { describe, expect, it } from "vitest";
import { experiments, topics } from "./catalog";
import {
	EXPERIMENT_PAGE_SIZE,
	experimentListingHref,
	listExperiments,
	readQuery,
} from "./experiment-listing";

const list = (params: Parameters<typeof readQuery>[0] = {}) =>
	listExperiments(readQuery(params));
const all = (params: Parameters<typeof readQuery>[0] = {}) => {
	const { pages } = list(params);
	return Array.from(
		{ length: pages },
		(_, i) => list({ ...params, page: String(i + 1) }).items,
	).flat();
};
const ids = (params: Parameters<typeof readQuery>[0] = {}) =>
	all(params).map((item) => item.id);

describe("experiment listing", () => {
	it("lists the whole catalog newest first by default", () => {
		const numbers = all().map((item) => item.number);
		expect(numbers).toHaveLength(experiments.length);
		expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
	});

	it("sorts oldest first and by title", () => {
		expect(list({ sort: "oldest" }).items[0].number).toBe(1);
		const titles = all({ sort: "title" }).map((item) => item.title);
		expect(titles).toEqual(
			[...titles].sort((a, b) => a.localeCompare(b, "en")),
		);
	});

	it("searches titles, descriptions, technology and topics", () => {
		expect(ids({ search: "  MOONSPELL  " })).toEqual(["moonspell"]);
		expect(ids({ search: "offline" })).toEqual(["crdt"]);
		expect(ids({ search: "Candle" })).toEqual(["deepseek"]);
		expect(ids({ search: "sound", sort: "oldest" })).toEqual([
			"audio-visualizer",
			"play-that-thing",
		]);
	});

	it("filters by topic and counts every topic against the search", () => {
		expect(ids({ topic: "sound", sort: "oldest" })).toEqual([
			"audio-visualizer",
			"play-that-thing",
		]);
		const all = list();
		expect(all.found).toBe(experiments.length);
		for (const t of topics) {
			expect(all.counts[t.value]).toBe(
				experiments.filter((e) => e.topics.includes(t.value)).length,
			);
			expect(all.counts[t.value]).toBeGreaterThan(0);
		}
		const searched = list({ search: "rust", topic: "sound" });
		expect(searched.items.map((item) => item.id)).toEqual(["audio-visualizer"]);
		expect(searched.found).toBeGreaterThan(searched.items.length);
		expect(searched.counts.sound).toBe(1);
	});

	it("pages six at a time and clamps out-of-range pages", () => {
		const first = list();
		expect(first.items).toHaveLength(EXPERIMENT_PAGE_SIZE);
		expect(first).toMatchObject({
			page: 1,
			pages: Math.ceil(experiments.length / EXPERIMENT_PAGE_SIZE),
			from: 1,
			to: EXPERIMENT_PAGE_SIZE,
			total: experiments.length,
		});
		expect(new Set(ids()).size).toBe(experiments.length);
		const last = list({ page: "999" });
		expect(last.page).toBe(last.pages);
		expect(last.to).toBe(experiments.length);
		expect(last.items).toHaveLength(last.to - last.from + 1);
		expect(list({ page: "0" }).page).toBe(1);
		expect(list({ page: "abc" }).page).toBe(1);
		expect(list({ search: "no-such-experiment" })).toMatchObject({
			page: 1,
			pages: 1,
			from: 0,
			to: 0,
		});
	});

	it("gives every experiment at least one known topic", () => {
		const known = new Set(topics.map((t) => t.value));
		for (const e of experiments) {
			expect(e.topics.length).toBeGreaterThan(0);
			for (const t of e.topics) expect(known.has(t)).toBe(true);
		}
	});

	it("ignores malformed and unknown parameters", () => {
		expect(
			readQuery({ topic: "unknown", sort: "loudest", page: "-2" }),
		).toEqual({
			search: "",
			topic: "",
			sort: "newest",
			page: 1,
		});
		expect(
			readQuery({ search: ["moonspell", "rust"], topic: ["design", "ai"] }),
		).toMatchObject({ search: "moonspell", topic: "design" });
		expect(list({ search: "no-such-experiment" })).toMatchObject({
			items: [],
			found: 0,
		});
	});

	it("round-trips queries through links and omits defaults", () => {
		const href = experimentListingHref({
			search: " Rust & WASM ",
			topic: "graphics",
			sort: "title",
			page: 2,
		});
		const url = new URL(href, "https://www.zeyaddeeb.com");
		expect(readQuery(Object.fromEntries(url.searchParams))).toEqual({
			search: "Rust & WASM",
			topic: "graphics",
			sort: "title",
			page: 2,
		});
		expect(
			experimentListingHref({ search: "  ", sort: "newest", page: 1 }),
		).toBe("/experiments");
		expect(experimentListingHref({ topic: "ai" })).toBe(
			"/experiments?topic=ai",
		);
	});
});
