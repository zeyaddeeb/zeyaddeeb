"use client";

import { GRID_SIZES } from "@zeyaddeeb/db/collection-options";
import { useState } from "react";
import { getTypeLabel, ITEM_TYPES } from "@/components/collection-type-icon";
import type { CollectionItemInput } from "@/lib/actions/write";
import { generateSlug } from "@/lib/slug";
import {
	CheckboxInput,
	ColorPicker,
	NumberInput,
	SelectInput,
	TextAreaInput,
	TextInput,
} from "./form-inputs";

interface CollectionFormFieldsProps {
	formData: CollectionItemInput;
	setFormData: React.Dispatch<React.SetStateAction<CollectionItemInput>>;
	initialTags: string[];
	autoSlug?: boolean;
}

export function CollectionFormFields({
	formData,
	setFormData,
	initialTags,
	autoSlug,
}: CollectionFormFieldsProps) {
	const [tagsInput, setTagsInput] = useState(initialTags.join(", "));

	const handleTitleChange = (title: string) =>
		setFormData((prev) => ({
			...prev,
			title,
			slug: autoSlug && !prev.slug ? generateSlug(title) : prev.slug,
		}));

	const handleTagsChange = (value: string) => {
		setTagsInput(value);
		const tags = value
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
		setFormData((prev) => ({ ...prev, tags }));
	};

	return (
		<>
			<div className="grid grid-cols-2 gap-4">
				<SelectInput
					label="Type"
					value={formData.type}
					onChange={(type) => setFormData((prev) => ({ ...prev, type }))}
					options={ITEM_TYPES}
					getOptionLabel={getTypeLabel}
				/>

				<SelectInput
					label="Grid Size"
					value={formData.gridSize}
					onChange={(gridSize) =>
						setFormData((prev) => ({ ...prev, gridSize }))
					}
					options={GRID_SIZES}
				/>
			</div>

			<TextInput
				label="Title"
				value={formData.title}
				onChange={handleTitleChange}
				placeholder="Item title"
				required
			/>

			<TextInput
				label="Slug"
				value={formData.slug}
				onChange={(slug) => setFormData((prev) => ({ ...prev, slug }))}
				placeholder="item-slug"
				required
			/>

			<TextAreaInput
				label="Description"
				value={formData.description || ""}
				onChange={(description) =>
					setFormData((prev) => ({ ...prev, description }))
				}
				placeholder="Brief description"
			/>

			<TextInput
				label="URL"
				value={formData.url || ""}
				onChange={(url) => setFormData((prev) => ({ ...prev, url }))}
				placeholder="https://example.com"
				type="url"
			/>

			<TextInput
				label="Image URL"
				value={formData.imageUrl || ""}
				onChange={(imageUrl) => setFormData((prev) => ({ ...prev, imageUrl }))}
				placeholder="https://example.com/image.jpg"
				type="url"
			/>

			<div className="grid grid-cols-2 gap-4">
				<ColorPicker
					label="Accent Color"
					value={formData.accentColor || ""}
					onChange={(accentColor) =>
						setFormData((prev) => ({ ...prev, accentColor }))
					}
				/>

				<NumberInput
					label="Display Order"
					value={formData.displayOrder || 0}
					onChange={(displayOrder) =>
						setFormData((prev) => ({ ...prev, displayOrder }))
					}
				/>
			</div>

			<TextInput
				label="Tags (comma-separated)"
				value={tagsInput}
				onChange={handleTagsChange}
				placeholder="design, inspiration, tech"
			/>

			<TextAreaInput
				label="Metadata (JSON)"
				value={JSON.stringify(formData.metadata || {}, null, 2)}
				onChange={(value) => {
					try {
						const parsed = JSON.parse(value || "{}");
						setFormData((prev) => ({ ...prev, metadata: parsed }));
					} catch {
						console.warn("Invalid JSON in metadata");
					}
				}}
				placeholder='{"key": "value"}'
				rows={6}
				className="font-mono text-sm"
			/>

			<div className="flex items-center gap-6">
				<CheckboxInput
					label="Featured"
					checked={formData.featured || false}
					onChange={(featured) =>
						setFormData((prev) => ({ ...prev, featured }))
					}
				/>

				<CheckboxInput
					label="Published"
					checked={formData.published || false}
					onChange={(published) =>
						setFormData((prev) => ({ ...prev, published }))
					}
				/>
			</div>
		</>
	);
}
