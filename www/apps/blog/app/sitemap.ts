import { collectionItem, db, eq, post } from "@zeyaddeeb/db";
import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const baseUrl = process.env.BASE_URL || "https://www.zeyaddeeb.com/blog";

	const staticPages: MetadataRoute.Sitemap = [
		{
			url: `${baseUrl}/blog`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${baseUrl}/posts`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/things-i-like`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.9,
		},
	];

	const collectionItems = await db
		.select()
		.from(collectionItem)
		.where(eq(collectionItem.published, true));

	const collectionPages: MetadataRoute.Sitemap = collectionItems.map(
		(item) => ({
			url: `${baseUrl}/things-i-like/${item.slug}`,
			lastModified: item.updatedAt,
			changeFrequency: "monthly" as const,
			priority: item.featured ? 0.8 : 0.6,
		}),
	);

	const blogPosts = await db
		.select()
		.from(post)
		.where(eq(post.published, true));

	const blogPages: MetadataRoute.Sitemap = blogPosts.map((p) => ({
		url: `${baseUrl}/posts/${p.slug}`,
		lastModified: p.updatedAt,
		changeFrequency: "monthly" as const,
		priority: 0.7,
	}));

	return [...staticPages, ...collectionPages, ...blogPages];
}
