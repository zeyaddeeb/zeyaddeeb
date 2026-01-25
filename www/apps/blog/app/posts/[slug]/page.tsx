import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPostBySlug, getRelatedPosts } from "@/lib/actions";
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
			title: "Post Not Found | Zeyad Deeb",
		};
	}

	return {
		title: `${post.title} | Zeyad Deeb`,
		description: post.excerpt || `Read ${post.title} on Zeyad Deeb's blog`,
		openGraph: {
			title: post.title,
			description: post.excerpt || undefined,
			images: post.coverImage ? [post.coverImage] : undefined,
		},
	};
}

export default async function BlogPostPage({ params }: PageProps) {
	const { slug } = await params;
	const post = await getPostBySlug(slug);

	if (!post) {
		notFound();
	}

	const relatedPosts = await getRelatedPosts(post.id, 3);

	return <BlogPostDetail post={post} relatedPosts={relatedPosts} />;
}
