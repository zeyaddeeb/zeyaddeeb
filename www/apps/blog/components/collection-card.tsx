"use client";
import type { CollectionItem } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { getTypeLabel } from "@/lib/collection-utils";

export function CollectionCard({
	item,
	className,
	index,
}: {
	item: CollectionItem;
	className?: string;
	index: number;
}) {
	return (
		<motion.div
			className={className}
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, delay: Math.min(index * 0.035, 0.2) }}
		>
			<Link
				href={`/library/${item.slug}`}
				className="library-card"
				data-color={index % 3}
			>
				{item.imageUrl && (
					<div className="library-card__image">
						<Image
							src={item.imageUrl}
							alt=""
							fill
							className="object-cover"
							sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 25vw"
						/>
					</div>
				)}
				<div className="library-card__body">
					<p className="blog-kicker">
						{getTypeLabel(item.type)}
						{item.featured ? " / Selected" : ""}
					</p>
					<h3>{item.title}</h3>
					{item.description && (
						<p className="library-card__description">{item.description}</p>
					)}
					{item.tags?.length ? (
						<p className="library-card__tags">
							{item.tags.slice(0, 3).join(" / ")}
						</p>
					) : null}
				</div>
			</Link>
		</motion.div>
	);
}
