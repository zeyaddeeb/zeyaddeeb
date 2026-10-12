import { describe, expect, it } from "vitest";
import { secrets } from "../features/catalog/catalog";
import sitemap from "./sitemap";

describe("sitemap", () => {
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

	it("leaves secret experiments out", () => {
		const urls = sitemap().map((entry) => entry.url);

		for (const { href } of secrets)
			expect(urls.some((url) => url.endsWith(href))).toBe(false);
	});
});
