"use client";

import type { Post } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import type { PaginatedResult } from "@/lib/actions";

interface BlogContentProps {
	initialData: PaginatedResult<Post>;
	currentPage: number;
	currentSearch: string;
}

export function BlogContent({
	initialData,
	currentPage,
	currentSearch,
}: BlogContentProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [searchValue, setSearchValue] = useState(currentSearch);

	const updateParams = useCallback(
		(updates: { search?: string; page?: number }) => {
			const params = new URLSearchParams(searchParams.toString());

			if (updates.search !== undefined) {
				if (updates.search) {
					params.set("search", updates.search);
				} else {
					params.delete("search");
				}
				params.delete("page");
			}

			if (updates.page !== undefined) {
				if (updates.page > 1) {
					params.set("page", updates.page.toString());
				} else {
					params.delete("page");
				}
			}

			startTransition(() => {
				router.push(`/posts?${params.toString()}`);
			});
		},
		[router, searchParams],
	);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		updateParams({ search: searchValue });
	};

	const handlePageChange = (page: number) => {
		updateParams({ page });
	};

	return (
		<div className="min-h-screen bg-neutral-950">
			<section className="border-b border-neutral-800/50 px-4 py-16 md:px-6 md:py-24">
				<div className="mx-auto max-w-4xl">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
					>
						<h1
							className="mb-4 text-4xl font-bold tracking-tight text-white md:text-6xl lg:text-7xl"
							style={{ fontFamily: "var(--font-space-grotesk)" }}
						>
							Blog
						</h1>
						<p className="max-w-2xl text-lg text-neutral-400 md:text-xl">
							Thoughts on software development, technology, and the things I'm
							learning along the way.
						</p>
					</motion.div>
				</div>
			</section>

			<section className="px-4 py-8 md:px-6 md:py-12">
				<div className="mx-auto max-w-4xl">
					<motion.form
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2, duration: 0.6 }}
						onSubmit={handleSearch}
						className="mb-8"
					>
						<div className="relative">
							<input
								type="text"
								value={searchValue}
								onChange={(e) => setSearchValue(e.target.value)}
								placeholder="Search posts..."
								className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-700"
							/>
							<button
								type="submit"
								disabled={isPending}
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-neutral-800 px-4 py-1.5 text-sm text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
							>
								Search
							</button>
						</div>
					</motion.form>

					{isPending && (
						<div className="mb-4 text-sm text-neutral-500">Loading...</div>
					)}

					{initialData.items.length > 0 ? (
						<div className="space-y-8">
							{initialData.items.map((post, index) => (
								<motion.article
									key={post.id}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										delay: 0.1 * index,
										duration: 0.5,
										ease: [0.22, 1, 0.36, 1],
									}}
								>
									<Link
										href={`/posts/${post.slug}`}
										className="group block rounded-xl border border-neutral-800/50 bg-neutral-900/30 p-6 transition-all hover:border-neutral-700 hover:bg-neutral-900/50"
									>
										{post.coverImage && (
											<div className="mb-4 aspect-video overflow-hidden rounded-lg">
												<img
													src={post.coverImage}
													alt={post.title}
													className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
												/>
											</div>
										)}
										<div className="flex items-center gap-3 text-sm text-neutral-500">
											{post.publishedAt && (
												<time>
													{new Date(post.publishedAt).toLocaleDateString(
														"en-US",
														{
															year: "numeric",
															month: "long",
															day: "numeric",
														},
													)}
												</time>
											)}
										</div>
										<h2 className="mt-3 text-xl font-semibold text-white transition-colors group-hover:text-neutral-200 md:text-2xl">
											{post.title}
										</h2>
										{post.excerpt && (
											<p className="mt-2 text-neutral-400">{post.excerpt}</p>
										)}
										<span className="mt-4 inline-block text-sm text-neutral-500 transition-colors group-hover:text-white">
											Read more →
										</span>
									</Link>
								</motion.article>
							))}

							{initialData.totalPages > 1 && (
								<div className="mt-12 flex items-center justify-center gap-2">
									<button
										type="button"
										onClick={() => handlePageChange(currentPage - 1)}
										disabled={!initialData.hasPreviousPage || isPending}
										className="rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
									>
										Previous
									</button>
									<span className="px-4 text-sm text-neutral-500">
										Page {currentPage} of {initialData.totalPages}
									</span>
									<button
										type="button"
										onClick={() => handlePageChange(currentPage + 1)}
										disabled={!initialData.hasNextPage || isPending}
										className="rounded-lg border border-neutral-800 px-4 py-2 text-sm text-neutral-400 transition-colors hover:border-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
									>
										Next
									</button>
								</div>
							)}
						</div>
					) : (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="flex h-64 items-center justify-center"
						>
							<p className="text-neutral-500">
								{currentSearch
									? "No posts match your search."
									: "No posts yet."}
							</p>
						</motion.div>
					)}
				</div>
			</section>
		</div>
	);
}
