"use client";

import type { CollectionItem, CollectionItemType } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { CollectionGrid, FilterBar } from "@/components";
import type { PaginatedResult } from "@/lib/actions";

interface ThingsILikeContentProps {
	initialData: PaginatedResult<CollectionItem>;
	allTypes: CollectionItemType[];
	currentPage: number;
	currentType: string | null;
	currentSearch: string;
}

export function ThingsILikeContent({
	initialData,
	allTypes,
	currentPage,
	currentType,
	currentSearch,
}: ThingsILikeContentProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const updateFilters = useCallback(
		(updates: { type?: string | null; search?: string; page?: number }) => {
			const params = new URLSearchParams(searchParams.toString());

			if (updates.type !== undefined) {
				if (updates.type) {
					params.set("type", updates.type);
				} else {
					params.delete("type");
				}
				params.delete("page"); // Reset page when filter changes
			}

			if (updates.search !== undefined) {
				if (updates.search.trim()) {
					params.set("q", updates.search.trim());
				} else {
					params.delete("q");
				}
				params.delete("page"); // Reset page when search changes
			}

			if (updates.page !== undefined) {
				if (updates.page > 1) {
					params.set("page", updates.page.toString());
				} else {
					params.delete("page");
				}
			}

			startTransition(() => {
				router.push(`/library?${params.toString()}`);
			});
		},
		[router, searchParams],
	);

	const handleTypeChange = (type: CollectionItemType | null) => {
		updateFilters({ type });
	};

	const handleSearchChange = (search: string) => {
		updateFilters({ search });
	};

	const handlePageChange = (page: number) => {
		updateFilters({ page });
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
							Library
						</h1>
						<p className="mt-1 text-sm text-neutral-500 md:text-base">
							A collection of wikipedia pages, art, books, youtube channels,
							products, and other things that have shaped how I think and what I
							appreciate.
						</p>
					</motion.div>
				</div>
			</section>

			<section>
				<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2, duration: 0.6 }}
					>
						<FilterBar
							types={allTypes}
							selectedType={currentType as CollectionItemType | null}
							onTypeChange={handleTypeChange}
							searchValue={currentSearch}
							onSearchChange={handleSearchChange}
						/>
					</motion.div>

					{isPending && (
						<div className="mb-4 text-sm text-neutral-500">Loading...</div>
					)}

					{initialData.items.length > 0 ? (
						<>
							<CollectionGrid
								items={initialData.items}
								filterKey={`${currentType ?? "all"}-${currentSearch}-${currentPage}`}
							/>

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
						</>
					) : (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="flex h-64 items-center justify-center"
						>
							<p className="text-neutral-500">No items match your filters.</p>
						</motion.div>
					)}
				</div>
			</section>
		</div>
	);
}
