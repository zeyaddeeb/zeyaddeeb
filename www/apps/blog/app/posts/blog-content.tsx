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
			<section className="border-b border-neutral-800/50">
				<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
					>
						<h1
							className="text-2xl font-bold tracking-tight text-white md:text-3xl"
							style={{ fontFamily: "var(--font-space-grotesk)" }}
						>
							Blog
						</h1>
						<p className="mt-1 text-sm text-neutral-500 md:text-base">
							Thoughts on software development, technology, and the things I'm
							learning along the way.
						</p>
					</motion.div>
				</div>
			</section>

			<section>
				<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
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
						<div className="space-y-6">
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
										className="group relative block overflow-hidden rounded-2xl bg-linear-to-br from-neutral-900 to-neutral-950 transition-all duration-500 hover:shadow-2xl hover:shadow-neutral-900/50"
									>
										<div className="absolute inset-0 rounded-2xl bg-linear-to-br from-neutral-700/50 via-transparent to-neutral-800/50 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
										<div className="absolute inset-px rounded-2xl bg-linear-to-br from-neutral-900 to-neutral-950" />

										<div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-start md:gap-6">
											{post.coverImage && (
												<div className="aspect-video w-full overflow-hidden rounded-xl md:aspect-square md:w-32 md:min-w-32 lg:w-40 lg:min-w-40">
													<img
														src={post.coverImage}
														alt={post.title}
														className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
													/>
												</div>
											)}

											<div className="flex flex-1 flex-col justify-between">
												<div>
													<div className="mb-3 flex items-center gap-3">
														{post.publishedAt && (
															<time className="text-xs font-medium uppercase tracking-wider text-neutral-500">
																{new Date(post.publishedAt).toLocaleDateString(
																	"en-US",
																	{
																		year: "numeric",
																		month: "short",
																		day: "numeric",
																	},
																)}
															</time>
														)}
													</div>

													<h2
														className="text-xl font-bold tracking-tight text-white transition-colors duration-300 group-hover:text-neutral-100 md:text-2xl"
														style={{ fontFamily: "var(--font-space-grotesk)" }}
													>
														{post.title}
													</h2>

													{post.excerpt && (
														<p className="mt-3 line-clamp-2 text-sm leading-relaxed text-neutral-400 md:text-base">
															{post.excerpt}
														</p>
													)}
												</div>

												<div className="mt-4 flex items-center gap-2 text-sm font-medium text-neutral-500 transition-all duration-300 group-hover:gap-3 group-hover:text-white">
													<span>Read article</span>
													<svg
														className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
														strokeWidth={2}
														aria-hidden="true"
													>
														<path
															strokeLinecap="round"
															strokeLinejoin="round"
															d="M17 8l4 4m0 0l-4 4m4-4H3"
														/>
													</svg>
												</div>
											</div>
										</div>
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
