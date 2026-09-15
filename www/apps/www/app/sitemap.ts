import { SITE_URL } from "@zeyaddeeb/ui/seo";
import type { MetadataRoute } from "next";
import { experiments } from "../features/catalog/catalog";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = SITE_URL;

	const fixed: MetadataRoute.Sitemap = [
		{ url: baseUrl, changeFrequency: "weekly", priority: 1 },
		{
			url: `${baseUrl}/experiments`,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/about`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/blog`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/resume`,
			changeFrequency: "monthly",
			priority: 0.6,
		},
	];

	const local = experiments
		.filter((e) => !e.external && e.href !== "/story")
		.map((e) => ({
			url: `${baseUrl}${e.href}`,
			changeFrequency: "monthly" as const,
			priority: 0.7,
		}));

	return [
		...fixed,
		{
			url: `${baseUrl}/story`,
			changeFrequency: "monthly",
			priority: 0.6,
		},
		...local,
	];
}
