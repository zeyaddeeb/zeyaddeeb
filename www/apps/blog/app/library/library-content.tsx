"use client";

import type { CollectionItem, CollectionItemType } from "@zeyaddeeb/db/schema";
import { Pagination } from "@zeyaddeeb/ui/pagination";
import { motion } from "framer-motion";
import { CollectionGrid } from "@/components/collection-grid";
import { FilterBar } from "@/components/filter-bar";
import { ListHeading } from "@/components/list-heading";
import { useQueryNav } from "@/lib/hooks/use-query-nav";
import type { PaginatedResult } from "@/lib/pagination";

interface LibraryContentProps {
	initialData: PaginatedResult<CollectionItem>;
	allTypes: CollectionItemType[];
	currentPage: number;
	currentType: CollectionItemType | null;
	currentSearch: string;
}

export function LibraryContent({
	initialData,
	allTypes,
	currentPage,
	currentType,
	currentSearch,
}: LibraryContentProps) {
	const { isPending, setParams } = useQueryNav("/library");

	const handleTypeChange = (type: CollectionItemType | null) => {
		setParams({ type });
	};

	const handleSearchChange = (search: string) => {
		setParams({ q: search.trim() });
	};

	return (
		<div className="min-h-screen bg-paper">
			<ListHeading
				title="Library"
				description="Books, art, videos, and links I’ve saved."
			/>

			<section>
				<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2, duration: 0.6 }}
					>
						<FilterBar
							types={allTypes}
							selectedType={currentType}
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
