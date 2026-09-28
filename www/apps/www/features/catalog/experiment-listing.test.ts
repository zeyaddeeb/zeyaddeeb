import { describe, expect, it } from "vitest";
import { experiments, topics } from "./catalog";
import {
	experimentListingHref,
	listExperiments,
	readQuery,
} from "./experiment-listing";

const list = (params: Parameters<typeof readQuery>[0] = {}) =>
	listExperiments(readQuery(params));
const ids = (params: Parameters<typeof readQuery>[0] = {}) =>
	list(params).items.map((item) => item.id);

describe("experiment listing", () => {
	it("lists the whole catalog newest first by default", () => {
		const numbers = list().items.map((item) => item.number);
		expect(numbers).toHaveLength(experiments.length);
		expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
	});

	it("sorts oldest first and by title", () => {
		expect(list({ sort: "oldest" }).items[0].number).toBe(1);
		const titles = list({ sort: "title" }).items.map((item) => item.title);
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

	it("gives every experiment at least one known topic", () => {
		const known = new Set(topics.map((t) => t.value));
		for (const e of experiments) {
			expect(e.topics.length).toBeGreaterThan(0);
			for (const t of e.topics) expect(known.has(t)).toBe(true);
		}
	});

	it("ignores malformed and unknown parameters", () => {
		expect(readQuery({ topic: "unknown", sort: "loudest" })).toEqual({
			search: "",
			topic: "",
			sort: "newest",
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
		});
		const url = new URL(href, "https://www.zeyaddeeb.com");
		expect(readQuery(Object.fromEntries(url.searchParams))).toEqual({
			search: "Rust & WASM",
			topic: "graphics",
			sort: "title",
		});
		expect(experimentListingHref({ search: "  ", sort: "newest" })).toBe(
			"/experiments",
		);
		expect(experimentListingHref({ topic: "ai" })).toBe(
			"/experiments?topic=ai",
		);
	});
});
