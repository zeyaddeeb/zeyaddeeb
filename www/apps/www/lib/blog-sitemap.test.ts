import { describe, expect, it, vi } from "vitest";

vi.mock("../../../packages/db/src/index", () => {
	const collectionItem = { published: "collection.published" };
	const post = { published: "post.published" };
	return {
		collectionItem,
		post,
		eq: (field: string, value: boolean) => ({ field, value }),
		db: {
			select: () => ({
				from: (table: typeof collectionItem) => ({
					where: async (condition: { field: string; value: boolean }) => {
						if (condition.field !== table.published || !condition.value) {
							throw new Error("The sitemap must select only published content");
						}
						return [
							{
								slug: table === post ? "rust-notes" : "a book",
								updatedAt: new Date("2026-01-02T00:00:00Z"),
								featured: false,
							},
						];
					},
				}),
			}),
		},
	};
});

import sitemap from "../../blog/app/sitemap";

describe("blog sitemap", () => {
	it("keeps exactly one blog prefix and uses stored modification dates", async () => {
		const entries = await sitemap();
		expect(entries.map((entry) => entry.url)).toEqual([
			"https://www.zeyaddeeb.com/blog",
			"https://www.zeyaddeeb.com/blog/posts",
			"https://www.zeyaddeeb.com/blog/library",
			"https://www.zeyaddeeb.com/blog/library/a%20book",
			"https://www.zeyaddeeb.com/blog/posts/rust-notes",
		]);
		for (const entry of entries.slice(0, 3)) {
			expect(entry.lastModified).toBeUndefined();
		}
		for (const entry of entries.slice(3)) {
			expect(entry.lastModified).toEqual(new Date("2026-01-02T00:00:00Z"));
		}
	});
});
