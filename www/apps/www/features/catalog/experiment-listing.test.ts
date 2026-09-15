import { describe, expect, it } from "vitest";
import { experiments } from "./catalog";
import { experimentListingHref, listExperiments } from "./experiment-listing";

describe("experiment listing", () => {
	it("paginates the complete catalog without gaps or duplicates", () => {
		const first = listExperiments({});
		const pages = Array.from({ length: first.totalPages }, (_, index) =>
			listExperiments({ page: String(index + 1) }),
		);
		expect(
			pages.flatMap((result) => result.items.map((item) => item.number)),
		).toEqual(
			[...experiments].map((item) => item.number).sort((a, b) => a - b),
		);
		expect(first).toMatchObject({ page: 1, from: 1, to: 6 });
	});

	it("searches titles, descriptions and technology across all pages", () => {
		expect(
			listExperiments({ search: "  MOONSPELL  " }).items.map((item) => item.id),
		).toEqual(["moonspell"]);
		expect(
			listExperiments({ search: "offline" }).items.map((item) => item.id),
		).toEqual(["crdt"]);
		expect(
			listExperiments({ search: "WebRTC" }).items.map((item) => item.id),
		).toEqual(["speaker-diarization"]);
	});

	it("combines search terms and type before pagination", () => {
		const result = listExperiments({
			search: "rust audio",
			type: "mic",
			page: "99",
		});
		expect(result.items.map((item) => item.id)).toEqual([
			"audio-visualizer",
			"speaker-diarization",
		]);
		expect(result).toMatchObject({ total: 2, page: 1, totalPages: 1 });
	});

	it("handles empty results, malformed parameters and stale page numbers", () => {
		expect(
			listExperiments({ search: "no-such-experiment", page: "3" }),
		).toMatchObject({ items: [], total: 0, from: 0, to: 0, page: 1 });
		for (const page of ["-1", "0", "1.5", "Infinity", "NaN"]) {
			expect(listExperiments({ page }).page).toBe(1);
		}
		expect(listExperiments({ page: "999" }).page).toBe(
			listExperiments({}).totalPages,
		);
		expect(listExperiments({ type: "unknown" }).total).toBe(experiments.length);
		expect(
			listExperiments({
				search: ["moonspell", "rust"],
				type: ["remote", "mic"],
			}).items.map((item) => item.id),
		).toEqual(["moonspell"]);
	});

	it("preserves encoded filters in page links and resets filters to page one", () => {
		const url = new URL(
			experimentListingHref({ search: "Rust & WASM", type: "wasm", page: 2 }),
			"https://www.zeyaddeeb.com",
		);
		expect(url.searchParams.get("search")).toBe("Rust & WASM");
		expect(url.searchParams.get("type")).toBe("wasm");
		expect(url.searchParams.get("page")).toBe("2");
		expect(experimentListingHref({ search: "rust", type: "mic" })).toBe(
			"/experiments?search=rust&type=mic",
		);
		expect(experimentListingHref({})).toBe("/experiments");
	});
});
