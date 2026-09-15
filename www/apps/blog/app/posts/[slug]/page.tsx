import { JsonLd } from "@zeyaddeeb/ui/json-ld";
import { pageMetadata, siteUrl, socialImageUrl } from "@zeyaddeeb/ui/seo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPostBySlug } from "@/lib/actions";
import { BlogPostDetail } from "./blog-post-detail";

interface PageProps {
	params: Promise<{
		slug: string;
	}>;
}

const getItem = cache(getPostBySlug);

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const post = await getItem(slug);
	if (!post) notFound();
	return pageMetadata({
		title: post.title,
		path: `/blog/posts/${encodeURIComponent(post.slug)}`,
		section: "Blog",
		description:
			post.excerpt || `Read ${post.title}, an article by Zeyad Deeb.`,
		image: post.coverImage,
		article: {
			publishedTime: post.publishedAt?.toISOString(),
			modifiedTime: post.updatedAt?.toISOString(),
		},
	});
}

export default async function BlogPostPage({ params }: PageProps) {
	const { slug } = await params;
	const post = await getItem(slug);

	if (!post) {
		notFound();
	}

	return (
		<>
			<JsonLd
				data={{
					"@context": "https://schema.org",
					"@type": "BlogPosting",
					headline: post.title,
					description: post.excerpt || undefined,
					url: siteUrl(`/blog/posts/${encodeURIComponent(post.slug)}`),
					mainEntityOfPage: siteUrl(
						`/blog/posts/${encodeURIComponent(post.slug)}`,
					),
					image: post.coverImage
						? siteUrl(post.coverImage)
						: socialImageUrl(post.title, "Blog"),
					datePublished: post.publishedAt?.toISOString(),
					dateModified: post.updatedAt?.toISOString(),
					author: {
						"@type": "Person",
						"@id": siteUrl("/#person"),
						name: "Zeyad Deeb",
						url: siteUrl("/about"),
					},
					publisher: { "@id": siteUrl("/#person") },
					isPartOf: { "@id": siteUrl("/#website") },
					inLanguage: "en-US",
				}}
			/>
			<BlogPostDetail post={post} />
		</>
	);
}
