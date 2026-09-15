"use client";

import type { Post } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Pagination } from "@/components/pagination";
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
		(updates: { search?: string }) => {
			const params = new URLSearchParams(searchParams.toString());

			if (updates.search !== undefined) {
				if (updates.search) {
					params.set("search", updates.search);
				} else {
					params.delete("search");
				}
				params.delete("page");
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

	return (
		<div className="min-h-screen bg-paper">
			<section className="blog-list-heading border-b border-rule">
				<div className="relative mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
					>
						<h1
							className="text-2xl font-bold tracking-tight text-ink md:text-3xl"
							style={{ fontFamily: "var(--font-display)" }}
						>
							Blog
						</h1>
						<p className="mt-1 text-sm text-dim md:text-base">
							Notes on software and things I’m learning.
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
								type="search"
								aria-label="Search posts"
								value={searchValue}
								onChange={(e) => setSearchValue(e.target.value)}
								placeholder="Search posts..."
								className="w-full rounded-none border border-rule bg-white px-4 py-3 text-ink placeholder:text-dim focus:border-ink focus:outline-none focus:ring-1 focus:ring-red"
							/>
							<button
								type="submit"
								disabled={isPending}
								className="absolute right-2 top-1/2 -translate-y-1/2 rounded-none bg-yellow px-4 py-1.5 text-sm text-ink transition-colors hover:bg-yellow disabled:opacity-50"
							>
								Search
							</button>
						</div>
					</motion.form>

					{isPending && <div className="mb-4 text-sm text-dim">Loading...</div>}

					{initialData.items.length > 0 ? (
						<div className="space-y-6">
							{initialData.items.map((post, index) => (
								<motion.article
									key={post.id}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										delay: Math.min(0.035 * index, 0.2),
										duration: 0.5,
										ease: [0.22, 1, 0.36, 1],
									}}
								>
									<Link
										href={`/posts/${post.slug}`}
										className="group relative block border-t-2 border-ink bg-paper transition-colors duration-200 hover:bg-white"
									>
										<div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-start md:gap-6">
											{post.coverImage && (
												<div className="relative aspect-video w-full overflow-hidden rounded-none md:aspect-square md:w-32 md:min-w-32 lg:w-40 lg:min-w-40">
													<Image
														src={post.coverImage}
														alt={post.title}
														fill
														className="object-cover transition-transform duration-700 group-hover:scale-110"
													/>
												</div>
											)}

											<div className="flex flex-1 flex-col justify-between">
												<div>
													<div className="mb-3 flex items-center gap-3">
														{post.publishedAt && (
															<time className="text-xs font-medium uppercase tracking-wider text-dim">
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
														className="text-xl font-bold tracking-normal text-ink transition-colors duration-300 group-hover:text-red md:text-2xl"
														style={{ fontFamily: "var(--font-display)" }}
													>
														{post.title}
													</h2>

													{post.excerpt && (
														<p className="mt-3 line-clamp-2 text-sm leading-relaxed text-dim md:text-base">
															{post.excerpt}
														</p>
													)}
												</div>

												<div className="mt-4 flex items-center gap-2 text-sm font-medium text-dim transition-all duration-300 group-hover:gap-3 group-hover:text-red">
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
								<Pagination
									page={currentPage}
									totalPages={initialData.totalPages}
									disabled={isPending}
								/>
							)}
						</div>
					) : (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="flex h-64 items-center justify-center"
						>
							<p className="text-dim">
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
