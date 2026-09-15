import {
	listingMetadata,
	pageMetadata,
	pageNumber,
	serializeJsonLd,
	siteUrl,
} from "@zeyaddeeb/ui/seo";
import { describe, expect, it } from "vitest";
import sitemap from "../app/sitemap";

describe("public metadata", () => {
	it("keeps the document and social titles in sync without nested title suffixes", () => {
		const metadata = pageMetadata({
			title: "CRDT Editor",
			description: "Collaborative editing in Rust.",
			path: "/experiments/crdt",
		});
		expect(metadata.title).toEqual({ absolute: "CRDT Editor | Zeyad Deeb" });
		expect(metadata.openGraph?.title).toBe("CRDT Editor | Zeyad Deeb");
		expect(metadata.twitter?.title).toBe(metadata.openGraph?.title);
		expect(metadata.alternates?.canonical).toBe(
			"https://www.zeyaddeeb.com/experiments/crdt",
		);
	});

	it("gives each paginated listing its own canonical URL", () => {
		const metadata = listingMetadata({
			title: "Library",
			description: "Saved references.",
			path: "/blog/library",
			page: "2",
		});
		expect(metadata.alternates?.canonical).toBe(
			"https://www.zeyaddeeb.com/blog/library?page=2",
		);
		expect(metadata.robots).toMatchObject({ index: true, follow: true });
	});

	it("excludes filtered searches while preserving their query and pagination", () => {
		const metadata = listingMetadata({
			title: "Library",
			description: "Saved references.",
			path: "/blog/library",
			page: "3",
			filters: { q: " rust & wasm ", type: "book" },
		});
		const url = new URL(String(metadata.alternates?.canonical));
		expect(url.pathname).toBe("/blog/library");
		expect(url.searchParams.get("q")).toBe("rust & wasm");
		expect(url.searchParams.get("page")).toBe("3");
		expect(metadata.robots).toMatchObject({ index: false, follow: true });
	});

	it("normalizes invalid pages and empty filters", () => {
		for (const value of [undefined, "-1", "0", "1.5", "NaN", "Infinity"]) {
			expect(pageNumber(value)).toBe(1);
		}
		const metadata = listingMetadata({
			title: "Blog",
			description: "Articles.",
			path: "/blog/posts",
			page: "1",
			filters: { search: " " },
		});
		expect(metadata.alternates?.canonical).toBe(siteUrl("/blog/posts"));
		expect(metadata.robots).toMatchObject({ index: true });
	});

	it("does not invent dimensions for uploaded social images", () => {
		const metadata = pageMetadata({
			title: "A book",
			description: "A saved book.",
			path: "/blog/library/a-book",
			image: "https://example.com/portrait.jpg",
		});
		expect(metadata.openGraph?.images).toEqual([
			{ url: "https://example.com/portrait.jpg", alt: "A book" },
		]);
	});

	it("escapes script delimiters in structured data without losing content", () => {
		const data = { headline: '</script><script>alert("test")</script>' };
		const serialized = serializeJsonLd(data);
		expect(serialized).not.toContain("<");
		expect(JSON.parse(serialized)).toEqual(data);
	});

	it("uses the canonical host and honest modification dates in the sitemap", () => {
		const entries = sitemap();
		expect(entries.length).toBeGreaterThan(10);
		expect(new Set(entries.map((entry) => entry.url)).size).toBe(
			entries.length,
		);
		for (const entry of entries) {
			expect(new URL(entry.url).origin).toBe("https://www.zeyaddeeb.com");
			expect(entry.lastModified).toBeUndefined();
		}
	});
});
