"use client";

import type { Post } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface BlogPostDetailProps {
	post: Post;
}

export function BlogPostDetail({ post }: BlogPostDetailProps) {
	return (
		<div className="min-h-screen bg-neutral-950">
			<article className="px-4 py-16 md:px-6 md:py-24">
				<div className="mx-auto max-w-3xl">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
					>
						<Link
							href="/posts"
							className="mb-8 inline-flex items-center text-sm text-neutral-500 transition-colors hover:text-white"
						>
							← Back to Blog
						</Link>

						<div className="mb-6 flex items-center gap-3 text-sm text-neutral-500">
							{post.publishedAt && (
								<time>
									{new Date(post.publishedAt).toLocaleDateString("en-US", {
										year: "numeric",
										month: "long",
										day: "numeric",
									})}
								</time>
							)}
						</div>

						<h1
							className="mb-8 text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl"
							style={{ fontFamily: "var(--font-space-grotesk)" }}
						>
							{post.title}
						</h1>

						{post.coverImage && (
							<div className="relative mb-8 aspect-video overflow-hidden rounded-xl">
								<Image
									src={post.coverImage}
									alt={post.title}
									fill
									className="object-cover"
									priority
								/>
							</div>
						)}

						<MarkdownRenderer content={post.content} />
					</motion.div>
				</div>
			</article>
		</div>
	);
}
