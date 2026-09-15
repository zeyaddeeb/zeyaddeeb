"use client";

import type { CollectionItem, CollectionItemType } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { CollectionGrid, FilterBar } from "@/components";
import { Pagination } from "@/components/pagination";
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
		(updates: { type?: string | null; search?: string }) => {
			const params = new URLSearchParams(searchParams.toString());

			if (updates.type !== undefined) {
				if (updates.type) {
					params.set("type", updates.type);
				} else {
					params.delete("type");
				}
				params.delete("page");
			}

			if (updates.search !== undefined) {
				if (updates.search.trim()) {
					params.set("q", updates.search.trim());
				} else {
					params.delete("q");
				}
				params.delete("page");
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

	return (
		<div className="min-h-screen bg-paper">
			<section className="blog-list-heading border-b border-rule">
				<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
					>
						<h1
							className="text-2xl font-bold tracking-tight text-ink md:text-3xl"
							style={{ fontFamily: "var(--font-display)" }}
						>
							Library
						</h1>
						<p className="mt-1 text-sm text-dim md:text-base">
							Books, art, videos, and links I’ve saved.
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

					{isPending && <div className="mb-4 text-sm text-dim">Loading...</div>}

					{initialData.items.length > 0 ? (
						<>
							<CollectionGrid
								items={initialData.items}
								filterKey={`${currentType ?? "all"}-${currentSearch}-${currentPage}`}
							/>

							{initialData.totalPages > 1 && (
								<Pagination
									page={currentPage}
									totalPages={initialData.totalPages}
									disabled={isPending}
								/>
							)}
						</>
					) : (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							className="flex h-64 items-center justify-center"
						>
							<p className="text-dim">No items match your filters.</p>
						</motion.div>
					)}
				</div>
			</section>
		</div>
	);
}
