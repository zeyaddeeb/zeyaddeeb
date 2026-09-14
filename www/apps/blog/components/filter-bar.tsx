"use client";

import type { CollectionItemType } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { getTypeIcon, getTypeLabel } from "@/lib/collection-utils";

function SearchIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.3-4.3" />
		</svg>
	);
}

function XIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}

interface FilterBarProps {
	types: CollectionItemType[];
	selectedType: CollectionItemType | null;
	onTypeChange: (type: CollectionItemType | null) => void;
	searchValue: string;
	onSearchChange: (search: string) => void;
}

export function FilterBar({
	types,
	selectedType,
	onTypeChange,
	searchValue,
	onSearchChange,
}: FilterBarProps) {
	const [localSearch, setLocalSearch] = useState(searchValue);
	const debounceRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		setLocalSearch(searchValue);
	}, [searchValue]);

	useEffect(
		() => () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		},
		[],
	);

	const handleSearchInput = (value: string) => {
		setLocalSearch(value);
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}
		debounceRef.current = setTimeout(() => {
			onSearchChange(value);
		}, 300);
	};

	const clearSearch = () => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		setLocalSearch("");
		onSearchChange("");
	};

	return (
		<div className="mb-6 space-y-4 sm:mb-8">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
				<div className="relative flex-1 sm:max-w-xs">
					<SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
					<input
						type="search"
						aria-label="Search library"
						value={localSearch}
						onChange={(e) => handleSearchInput(e.target.value)}
						placeholder="Search..."
						className="w-full rounded-none border border-rule bg-white py-2 pl-10 pr-10 text-sm text-ink placeholder-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
					/>
					{localSearch && (
						<button
							type="button"
							onClick={clearSearch}
							aria-label="Clear search"
							className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-ink"
						>
							<XIcon className="h-4 w-4" />
						</button>
					)}
				</div>

				<div className="-mx-4 flex-1 px-4 sm:mx-0 sm:px-0">
					<div className="flex items-center gap-2 overflow-x-auto pb-2 sm:overflow-visible sm:pb-0">
						<button
							type="button"
							onClick={() => onTypeChange(null)}
							aria-pressed={selectedType === null}
							className={`shrink-0 rounded-none px-4 py-2 text-xs font-medium uppercase tracking-wider transition-all ${
								selectedType === null
									? "border border-ink bg-yellow text-ink"
									: "border border-rule bg-paper text-ink hover:bg-yellow"
							}`}
						>
							All
						</button>
						{types.map((type) => {
							const Icon = getTypeIcon(type);
							const isSelected = selectedType === type;
							return (
								<motion.button
									key={type}
									type="button"
									onClick={() => onTypeChange(isSelected ? null : type)}
									aria-pressed={isSelected}
									whileHover={{ scale: 1.02 }}
									whileTap={{ scale: 0.98 }}
									className={`flex shrink-0 items-center gap-1.5 rounded-none px-4 py-2 text-xs font-medium uppercase tracking-wider transition-all ${
										isSelected
											? "border border-ink bg-yellow text-ink"
											: "border border-rule bg-paper text-ink hover:bg-yellow"
									}`}
								>
									<Icon className="h-3.5 w-3.5" />
									{getTypeLabel(type)}
								</motion.button>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
}
