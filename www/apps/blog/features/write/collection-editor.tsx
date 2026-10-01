"use client";

import type { CollectionItem } from "@zeyaddeeb/db/schema";
import { useState } from "react";
import {
	type CollectionItemInput,
	createCollectionItem,
	deleteCollectionItem,
	updateCollectionItem,
} from "@/lib/actions/write";
import { CollectionFormFields } from "./collection-form";
import { CollectionPreview } from "./collection-preview";
import {
	DeleteButton,
	ErrorAlert,
	FormActions,
	PageHeader,
	PreviewToggle,
	type WriterUser,
} from "./form-layout";
import { useEditorActions } from "./use-editor-actions";

const EMPTY_ITEM: CollectionItemInput = {
	type: "other",
	title: "",
	slug: "",
	description: "",
	url: "",
	imageUrl: "",
	thumbnailUrl: "",
	accentColor: "",
	gridSize: "medium",
	displayOrder: 0,
	metadata: {},
	tags: [],
	featured: false,
	published: false,
};

function toInput(item: CollectionItem): CollectionItemInput {
	return {
		type: item.type,
		title: item.title,
		slug: item.slug,
		description: item.description || "",
		url: item.url || "",
		imageUrl: item.imageUrl || "",
		thumbnailUrl: item.thumbnailUrl || "",
		accentColor: item.accentColor || "",
		gridSize: item.gridSize || "medium",
		displayOrder: item.displayOrder || 0,
		metadata: { ...item.metadata },
		tags: item.tags || [],
		featured: item.featured,
		published: item.published,
	};
}

interface CollectionEditorProps {
	user: WriterUser;
	item?: CollectionItem;
}

export function CollectionEditor({ user, item }: CollectionEditorProps) {
	const [showPreview, setShowPreview] = useState(false);

	const [formData, setFormData] = useState<CollectionItemInput>(() =>
		item ? toInput(item) : EMPTY_ITEM,
	);

	const actions = useEditorActions({
		save: () =>
			item
				? updateCollectionItem(item.id, formData)
				: createCollectionItem(formData),
		savedHref: ({ slug }) => `/library/${slug}`,
		remove: item ? () => deleteCollectionItem(item.id) : undefined,
		removedHref: "/library",
		noun: "item",
	});

	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-6xl mx-auto">
				<PageHeader
					title={item ? "Edit Collection Item" : "Add to Library"}
					user={user}
					actions={
						<PreviewToggle
							showPreview={showPreview}
							onToggle={() => setShowPreview(!showPreview)}
						/>
					}
				/>

				<ErrorAlert error={actions.error} />

				<div className={`grid gap-8 ${showPreview ? "lg:grid-cols-2" : ""}`}>
					<form onSubmit={actions.submit} className="space-y-6">
						<CollectionFormFields
							formData={formData}
							setFormData={setFormData}
							initialTags={item?.tags ?? []}
							autoSlug={!item}
						/>

						<FormActions
							isSubmitting={actions.isSubmitting}
							submitLabel={item ? "Save Changes" : "Create Item"}
							submittingLabel={item ? "Saving..." : "Creating..."}
							onCancel={actions.cancel}
							deleteButton={
								item && (
									<DeleteButton
										onClick={actions.destroy}
										isDeleting={actions.isDeleting}
										label="Delete Item"
									/>
								)
							}
						/>
					</form>

					{showPreview && <CollectionPreview formData={formData} />}
				</div>
			</div>
		</main>
	);
}
