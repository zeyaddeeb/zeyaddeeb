"use client";

import type { CollectionItem } from "@zeyaddeeb/db/schema";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { getTypeIcon, getTypeLabel } from "@/lib/collection-utils";

interface CollectionItemDetailProps {
	item: CollectionItem;
}

export function CollectionItemDetail({ item }: CollectionItemDetailProps) {
	const TypeIcon = getTypeIcon(item.type);
	const metadata = item.metadata as Record<string, unknown> | null;

	return (
		<div className="min-h-screen bg-neutral-950">
			<section className="relative">
				{item.imageUrl && (
					<div className="relative h-[50vh] w-full md:h-[60vh]">
						<Image
							src={item.imageUrl}
							alt={item.title}
							fill
							className="object-cover"
							priority
						/>
						<div className="absolute inset-0 bg-linear-to-t from-neutral-950 via-neutral-950/50 to-transparent" />
					</div>
				)}

				<div className="relative mx-auto max-w-4xl px-4 pb-12 md:px-6">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
						className={item.imageUrl ? "-mt-32" : "pt-12"}
					>
						<Link
							href="/things-i-like"
							className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white"
						>
							<svg
								className="h-4 w-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								aria-hidden="true"
							>
								<title>Back arrow</title>
								<path d="M19 12H5M12 19l-7-7 7-7" />
							</svg>
							Back to Things I Like
						</Link>

						<div className="mb-4 flex items-center gap-3">
							<span
								className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider"
								style={{
									backgroundColor: item.accentColor
										? `${item.accentColor}20`
										: "rgba(255,255,255,0.1)",
									color: item.accentColor || "rgb(163 163 163)",
								}}
							>
								<TypeIcon className="h-4 w-4" />
								{getTypeLabel(item.type)}
							</span>
							{item.featured && (
								<span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-medium uppercase tracking-wider text-amber-400">
									Featured
								</span>
							)}
						</div>

						<h1
							className="mb-4 text-3xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl"
							style={{ fontFamily: "var(--font-space-grotesk)" }}
						>
							{item.title}
						</h1>

						{item.description && (
							<p className="mb-8 max-w-2xl text-lg text-neutral-400 md:text-xl">
								{item.description}
							</p>
						)}

						{item.tags && item.tags.length > 0 && (
							<div className="mb-8 flex flex-wrap gap-2">
								{item.tags.map((tag) => (
									<span
										key={tag}
										className="rounded-full bg-neutral-800 px-3 py-1 text-sm text-neutral-400"
									>
										{tag}
									</span>
								))}
							</div>
						)}

						{item.url && (
							<a
								href={item.url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-medium text-neutral-900 transition-all hover:bg-neutral-200"
							>
								Visit
								<svg
									className="h-4 w-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									aria-hidden="true"
								>
									<title>External link</title>
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
									<polyline points="15 3 21 3 21 9" />
									<line x1="10" y1="14" x2="21" y2="3" />
								</svg>
							</a>
						)}
					</motion.div>
				</div>
			</section>

			{metadata && Object.keys(metadata).length > 0 && (
				<section className="border-t border-neutral-800/50 px-4 py-12 md:px-6">
					<div className="mx-auto max-w-4xl">
						<motion.div
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.2, duration: 0.6 }}
						>
							<h2 className="mb-6 text-lg font-medium text-white">Details</h2>
							<div className="grid gap-4 md:grid-cols-2">
								{Object.entries(metadata).map(([key, value]) => {
									if (!value) return null;
									const label = key
										.replace(/([A-Z])/g, " $1")
										.replace(/^./, (str) => str.toUpperCase());
									return (
										<div key={key} className="rounded-lg bg-neutral-900/50 p-4">
											<dt className="mb-1 text-xs uppercase tracking-wider text-neutral-500">
												{label}
											</dt>
											<dd className="text-white">
												{Array.isArray(value)
													? value.join(", ")
													: String(value)}
											</dd>
										</div>
									);
								})}
							</div>
						</motion.div>
					</div>
				</section>
			)}

			<footer className="border-t border-neutral-800/50 px-4 py-8 md:px-6">
				<div className="mx-auto max-w-4xl text-center text-sm text-neutral-500">
					<p>
						Added on{" "}
						{item.createdAt.toLocaleDateString("en-US", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})}
					</p>
				</div>
			</footer>
		</div>
	);
}
