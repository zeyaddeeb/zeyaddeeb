import type { MetadataRoute } from "next";
import { experiments } from "@/features/catalog/catalog";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = process.env.BASE_URL || "https://zeyaddeeb.com";
	const now = new Date();

	const fixed: MetadataRoute.Sitemap = [
		{ url: baseUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
		{
			url: `${baseUrl}/experiments`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/about`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/blog`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/resume`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.6,
		},
	];

	const local = experiments
		.filter((e) => !e.external && e.href !== "/story")
		.map((e) => ({
			url: `${baseUrl}${e.href}`,
			lastModified: now,
			changeFrequency: "monthly" as const,
			priority: 0.7,
		}));

	return [
		...fixed,
		{
			url: `${baseUrl}/story`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.6,
		},
		...local,
	];
}
