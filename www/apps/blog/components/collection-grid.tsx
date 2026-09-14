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
	const getGridSize = (size: string | null, index: number) => {
		if (columns) return "medium";
		if (size && size !== "medium") return size;
		const pattern = ["medium", "medium", "tall", "wide", "medium"];
		return pattern[index % pattern.length];
	};

	const getGridClassName = () => {
		if (columns === 2) {
			return "library-grid grid grid-cols-1 gap-4 sm:grid-cols-2";
		}
		if (columns === 3) {
			return "library-grid grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3";
		}
		if (columns === 4) {
			return "library-grid grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
		}
		return "library-grid grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-5 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5";
	};

	return (
		<motion.div
			key={filterKey}
			variants={containerVariants}
			initial="hidden"
			animate="visible"
			className={getGridClassName()}
			data-layout={columns ? "uniform" : "bento"}
		>
			{items.map((item, index) => (
				<CollectionCard
					key={item.id}
					item={item}
					className="library-grid__item"
					layoutSize={getGridSize(item.gridSize, index)}
					index={index}
				/>
			))}
		</motion.div>
	);
}
