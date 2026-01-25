"use client";

import type { Post } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import Link from "next/link";

interface BlogPostDetailProps {
	post: Post;
	relatedPosts: Post[];
}

export function BlogPostDetail({ post, relatedPosts }: BlogPostDetailProps) {
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

						<div className="mb-4 flex items-center gap-3 text-sm text-neutral-500">
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
							className="mb-6 text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl"
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
							<div
								// biome-ignore lint/security/noDangerouslySetInnerHtml: Content is from trusted source (admin only)
								dangerouslySetInnerHTML={{
									__html: post.content
										.replace(/^### (.+)$/gm, "<h3>$1</h3>")
										.replace(/^## (.+)$/gm, "<h2>$1</h2>")
										.replace(/^# (.+)$/gm, "<h1>$1</h1>")
										.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
										.replace(/\*(.+?)\*/g, "<em>$1</em>")
										.replace(/`([^`]+)`/g, "<code>$1</code>")
										.replace(
											/```(\w+)?\n([\s\S]+?)```/g,
											"<pre><code>$2</code></pre>",
										)
										.replace(/^- (.+)$/gm, "<li>$1</li>")
										.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
										.replace(/\n\n/g, "</p><p>")
										.replace(/^(?!<)(.+)$/gm, "<p>$1</p>"),
								}}
							/>
						</div>
					</motion.div>
				</div>
			</article>

			{relatedPosts.length > 0 && (
				<section className="border-t border-neutral-800/50 px-4 py-12 md:px-6 md:py-16">
					<div className="mx-auto max-w-3xl">
						<h2
							className="mb-8 text-2xl font-bold text-white"
							style={{ fontFamily: "var(--font-space-grotesk)" }}
						>
							More Posts
						</h2>
						<div className="grid gap-6 md:grid-cols-3">
							{relatedPosts.map((relatedPost) => (
								<Link
									key={relatedPost.id}
									href={`/posts/${relatedPost.slug}`}
									className="group block rounded-xl border border-neutral-800/50 bg-neutral-900/30 p-4 transition-all hover:border-neutral-700 hover:bg-neutral-900/50"
								>
									{relatedPost.coverImage && (
										<div className="mb-3 aspect-video overflow-hidden rounded-lg">
											<img
												src={relatedPost.coverImage}
												alt={relatedPost.title}
												className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											/>
										</div>
									)}
									<h3 className="text-sm font-medium text-white transition-colors group-hover:text-neutral-200">
										{relatedPost.title}
									</h3>
								</Link>
							))}
						</div>
					</div>
				</section>
			)}
		</div>
	);
}
