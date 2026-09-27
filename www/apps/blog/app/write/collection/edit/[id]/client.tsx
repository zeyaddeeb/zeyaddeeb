"use client";

import type { CollectionItem } from "@zeyaddeeb/db";
import type { GRID_SIZES } from "@zeyaddeeb/db/collection-options";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CollectionFormFields } from "@/features/write/collection-form";
import { CollectionPreview } from "@/features/write/collection-preview";
import {
	DeleteButton,
	ErrorAlert,
	FormActions,
	PageHeader,
	PreviewToggle,
} from "@/features/write/form-layout";
import type { User } from "@/features/write/types";
import {
	type CollectionItemInput,
	deleteCollectionItem,
	updateCollectionItem,
} from "@/lib/actions/write";

interface CollectionEditClientProps {
	user: User;
	item: CollectionItem;
}

export function CollectionEditClient({
	user,
	item,
}: CollectionEditClientProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(false);

	const [formData, setFormData] = useState<CollectionItemInput>({
		type: item.type,
		title: item.title,
		slug: item.slug,
		description: item.description || "",
		url: item.url || "",
		imageUrl: item.imageUrl || "",
		thumbnailUrl: item.thumbnailUrl || "",
		accentColor: item.accentColor || "",
		gridSize: (item.gridSize as (typeof GRID_SIZES)[number]) || "medium",
		displayOrder: item.displayOrder || 0,
		metadata: (item.metadata as Record<string, unknown>) || {},
		tags: item.tags || [],
		featured: item.featured,
		published: item.published,
	});

	const [tagsInput, setTagsInput] = useState((item.tags || []).join(", "));

	const handleTagsChange = (value: string) => {
		setTagsInput(value);
		const tags = value
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		setFormData((prev) => ({ ...prev, tags }));
	};

	const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const result = await updateCollectionItem(item.id, formData);

		if (result.success) {
			router.push(`/library/${result.data.slug}`);
		} else {
			setError(result.error);
			setIsSubmitting(false);
		}
	};

	const handleDelete = async () => {
		if (
			!confirm(
				"Are you sure you want to delete this item? This action cannot be undone.",
			)
		) {
			return;
		}

		setIsDeleting(true);
		setError(null);

		const result = await deleteCollectionItem(item.id);

		if (result.success) {
			router.push("/library");
		} else {
			setError(result.error);
			setIsDeleting(false);
		}
	};

	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-6xl mx-auto">
				<PageHeader
					title="Edit Collection Item"
					user={user}
					actions={
						<PreviewToggle
							showPreview={showPreview}
							onToggle={() => setShowPreview(!showPreview)}
						/>
					}
				/>

				<ErrorAlert error={error} />

				<div className={`grid gap-8 ${showPreview ? "lg:grid-cols-2" : ""}`}>
					<form onSubmit={handleSubmit} className="space-y-6">
						<CollectionFormFields
							formData={formData}
							setFormData={setFormData}
							tagsInput={tagsInput}
							onTagsChange={handleTagsChange}
						/>

						<FormActions
							isSubmitting={isSubmitting}
							submitLabel="Save Changes"
							submittingLabel="Saving..."
							onCancel={() => router.back()}
							deleteButton={
								<DeleteButton
									onClick={handleDelete}
									isDeleting={isDeleting}
									label="Delete Item"
								/>
							}
						/>
					</form>

					{showPreview && <CollectionPreview formData={formData} />}
				</div>
			</div>
		</main>
	);
}
