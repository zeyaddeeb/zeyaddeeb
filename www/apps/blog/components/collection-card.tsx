"use client";

import type { CollectionItem } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { getTypeIcon, getTypeLabel } from "@/lib/collection-utils";

interface CollectionCardProps {
	item: CollectionItem;
	className?: string;
	index: number;
}

const cardVariants = {
	hidden: {
		opacity: 0,
		y: 20,
		scale: 0.95,
	},
	visible: {
		opacity: 1,
		y: 0,
		scale: 1,
		transition: {
			duration: 0.5,
			ease: [0.22, 1, 0.36, 1] as const,
		},
	},
};

export function CollectionCard({
	item,
	className,
	index,
}: CollectionCardProps) {
	const typeLabel = getTypeLabel(item.type);
	const TypeIcon = getTypeIcon(item.type);

	const isLarge =
		className?.includes("sm:col-span-2") &&
		className?.includes("sm:row-span-2");
	const isTall =
		className?.includes("sm:row-span-2") &&
		!className?.includes("sm:col-span-2");

	return (
		<motion.div variants={cardVariants} className={className}>
			<Link
				href={`/things-i-like/${item.slug}`}
				className="group relative flex h-full min-h-50 flex-col overflow-hidden rounded-lg bg-neutral-900/50 transition-all duration-500 hover:bg-neutral-900/80 sm:min-h-0"
				style={{
					borderColor: item.accentColor || "transparent",
					borderWidth: item.accentColor ? "1px" : "0",
				}}
			>
				{item.imageUrl && (
					<div
						className={`relative w-full overflow-hidden ${isLarge ? "h-40 sm:h-2/3" : isTall ? "h-40 sm:h-1/2" : "h-40 sm:h-32 md:h-40"}`}
					>
						<Image
							src={item.imageUrl}
							alt={item.title}
							fill
							className="object-cover transition-transform duration-700 group-hover:scale-105"
							sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
						/>
						<div className="absolute inset-0 bg-linear-to-t from-neutral-900 via-transparent to-transparent opacity-60" />
					</div>
				)}

				<div className="relative flex flex-1 flex-col justify-end p-3 md:p-4">
					<div className="mb-2 flex items-center gap-2">
						<span
							className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
							style={{
								backgroundColor: item.accentColor
									? `${item.accentColor}20`
									: "rgba(255,255,255,0.1)",
								color: item.accentColor || "rgb(163 163 163)",
							}}
						>
							<TypeIcon className="h-3 w-3" />
							{typeLabel}
						</span>
						{item.featured && (
							<span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
								Featured
							</span>
						)}
					</div>

					<h3
						className={`font-medium text-white transition-colors group-hover:text-neutral-200 ${
							isLarge ? "text-xl md:text-2xl" : "text-sm md:text-base"
						} line-clamp-2`}
					>
						{item.title}
					</h3>

					{(isLarge || isTall) && item.description && (
						<p className="mt-2 line-clamp-3 text-xs text-neutral-400 md:text-sm">
							{item.description}
						</p>
					)}

					{item.tags &&
						item.tags.length > 0 &&
						(isLarge || index % 3 === 0) && (
							<div className="mt-3 flex flex-wrap gap-1">
								{item.tags.slice(0, 3).map((tag) => (
									<span
										key={tag}
										className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500"
									>
										{tag}
									</span>
								))}
							</div>
						)}
				</div>

				<motion.div
					className="pointer-events-none absolute inset-0 rounded-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100"
					style={{
						background: item.accentColor
							? `linear-gradient(135deg, ${item.accentColor}10 0%, transparent 50%)`
							: "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 50%)",
					}}
				/>
			</Link>
		</motion.div>
	);
}
