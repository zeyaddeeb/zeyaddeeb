import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPostBySlug } from "@/lib/actions";
import { BlogPostDetail } from "./blog-post-detail";

interface PageProps {
	params: Promise<{
		slug: string;
	}>;
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const post = await getPostBySlug(slug);

	if (!post) {
		return {
			title: "Post Not Found",
		};
	}

	const ogImage = post.coverImage || "/og-image.png";

	return {
		title: `${post.title} | Blog`,
		description: post.excerpt || `Read ${post.title} on Zeyad Deeb's blog`,
		authors: [{ name: "Zeyad Deeb" }],
		openGraph: {
			type: "article",
			title: `${post.title} | Blog`,
			description: post.excerpt || `Read ${post.title} on Zeyad Deeb's blog`,
			url: `https://www.zeyaddeeb.com/blog/posts/${slug}`,
			siteName: "Zeyad Deeb - Blog",
			images: [
				{
					url: ogImage,
					width: 1200,
					height: 630,
					alt: post.title,
				},
			],
			publishedTime: post.publishedAt?.toISOString(),
			modifiedTime: post.updatedAt?.toISOString(),
		},
		twitter: {
			card: "summary_large_image",
			title: `${post.title} | Blog`,
			description: post.excerpt || `Read ${post.title} on Zeyad Deeb's blog`,
			images: [ogImage],
			creator: "@zeyad_deeb",
		},
	};
}

export default async function BlogPostPage({ params }: PageProps) {
	const { slug } = await params;
	const post = await getPostBySlug(slug);

	if (!post) {
		notFound();
	}

	return <BlogPostDetail post={post} />;
}
