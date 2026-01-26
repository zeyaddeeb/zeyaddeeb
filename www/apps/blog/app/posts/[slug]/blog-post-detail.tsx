"use client";

import type { Post } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
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
							<div className="mb-8 aspect-video overflow-hidden rounded-xl">
								<img
									src={post.coverImage}
									alt={post.title}
									className="h-full w-full object-cover"
								/>
							</div>
						)}

						<div className="prose prose-lg prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-neutral-300 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-white prose-code:rounded prose-code:bg-neutral-800 prose-code:px-1 prose-code:py-0.5 prose-code:text-neutral-200 prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-800">
							<MarkdownRenderer content={post.content} />
						</div>
					</motion.div>
				</div>
			</article>
		</div>
	);
}
