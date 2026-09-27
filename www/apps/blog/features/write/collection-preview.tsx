"use client";

import Image from "next/image";
import { getTypeIcon, getTypeLabel } from "@/components/collection-type-icon";
import type { CollectionItemInput } from "@/lib/actions/write";

interface CollectionPreviewProps {
	formData: CollectionItemInput;
}

export function CollectionPreview({ formData }: CollectionPreviewProps) {
	const TypeIcon = getTypeIcon(formData.type);

	return (
		<div className="lg:sticky lg:top-8 lg:self-start">
			<h2 className="text-lg font-semibold mb-4">Preview</h2>
			<div className="max-w-sm">
				<div
					className="group relative flex h-full min-h-50 flex-col overflow-hidden rounded-lg bg-neutral-900/50 transition-all duration-500"
					style={{
						borderColor: formData.accentColor || "transparent",
						borderWidth: formData.accentColor ? "1px" : "0",
					}}
				>
					{formData.imageUrl && (
						<div className="relative w-full h-40 overflow-hidden">
							<Image
								src={formData.imageUrl}
								alt={formData.title || "Preview"}
								fill
								className="object-cover"
								sizes="300px"
							/>
							<div className="absolute inset-0 bg-linear-to-t from-neutral-900 via-transparent to-transparent opacity-60" />
						</div>
					)}

					<div className="relative flex flex-1 flex-col justify-end p-4">
						<div className="mb-2 flex items-center gap-2">
							<span
								className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
								style={{
									backgroundColor: formData.accentColor
										? `${formData.accentColor}20`
										: "rgba(255,255,255,0.1)",
									color: formData.accentColor || "rgb(163 163 163)",
								}}
							>
								<TypeIcon className="h-3 w-3" />
								{getTypeLabel(formData.type)}
							</span>
							{formData.featured && (
								<span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400">
									Featured
								</span>
							)}
						</div>

						<h3 className="font-medium text-white text-base line-clamp-2">
							{formData.title || "Item Title"}
						</h3>

						{formData.description && (
							<p className="mt-2 line-clamp-3 text-xs text-neutral-400">
								{formData.description}
							</p>
						)}

						{formData.tags && formData.tags.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-1">
								{formData.tags.slice(0, 3).map((tag) => (
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
				</div>
			</div>
		</div>
	);
}
