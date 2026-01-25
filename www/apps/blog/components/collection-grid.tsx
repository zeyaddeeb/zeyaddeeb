"use client";

import type { CollectionItem } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import { CollectionCard } from "./collection-card";

interface CollectionGridProps {
	items: CollectionItem[];
	filterKey?: string;
	columns?: 2 | 3 | 4 | 5;
}

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: {
			staggerChildren: 0.08,
			delayChildren: 0.1,
		},
	},
};

export function CollectionGrid({
	items,
	filterKey = "all",
	columns,
}: CollectionGridProps) {
	const getGridClass = (size: string | null, index: number) => {
		if (columns) {
			return "col-span-1 row-span-1";
		}

		const baseSize = size || "medium";

		switch (baseSize) {
			case "large":
				return "col-span-1 sm:col-span-2 sm:row-span-2";
			case "wide":
				return "col-span-1 sm:col-span-2 sm:row-span-1";
			case "tall":
				return "col-span-1 sm:row-span-2";
			case "small":
				return "col-span-1 row-span-1";
			default: {
				const patterns = [
					"col-span-1 row-span-1",
					"col-span-1 sm:col-span-1 row-span-1",
					"col-span-1 sm:row-span-2",
					"col-span-1 sm:col-span-2 sm:row-span-1",
					"col-span-1 row-span-1",
				];
				return patterns[index % patterns.length];
			}
		}
	};

	const getGridClassName = () => {
		if (columns === 2) {
			return "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:auto-rows-[minmax(140px,auto)]";
		}
		if (columns === 3) {
			return "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 sm:auto-rows-[minmax(160px,auto)]";
		}
		if (columns === 4) {
			return "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:auto-rows-[minmax(160px,auto)]";
		}
		return "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:auto-rows-[minmax(180px,auto)] md:grid-cols-3 md:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5";
	};

	return (
		<motion.div
			key={filterKey}
			variants={containerVariants}
			initial="hidden"
			animate="visible"
			className={getGridClassName()}
		>
			{items.map((item, index) => (
				<CollectionCard
					key={item.id}
					item={item}
					className={getGridClass(item.gridSize, index)}
					index={index}
				/>
			))}
		</motion.div>
	);
}
