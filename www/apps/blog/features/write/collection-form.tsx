"use client";

import type { CollectionItemType } from "@zeyaddeeb/db";
import { GRID_SIZES, type GridSize } from "@zeyaddeeb/db/collection-options";
import type { CollectionItemInput } from "@/lib/actions/write";
import { ITEM_TYPES } from "@/lib/collection-options";
import { getTypeLabel } from "@/lib/collection-utils";
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
	tagsInput: string;
	onTagsChange: (value: string) => void;
	onTitleChange?: (title: string) => void;
}

export function CollectionFormFields({
	formData,
	setFormData,
	tagsInput,
	onTagsChange,
	onTitleChange,
}: CollectionFormFieldsProps) {
	const handleTitleChange = (title: string) => {
		if (onTitleChange) {
			onTitleChange(title);
		} else {
			setFormData((prev) => ({ ...prev, title }));
		}
	};

	return (
		<>
			<div className="grid grid-cols-2 gap-4">
				<SelectInput
					label="Type"
					value={formData.type}
					onChange={(type) =>
						setFormData((prev) => ({
							...prev,
							type: type as CollectionItemType,
						}))
					}
					options={ITEM_TYPES}
					getOptionLabel={getTypeLabel}
				/>

				<SelectInput
					label="Grid Size"
					value={formData.gridSize}
					onChange={(gridSize) =>
						setFormData((prev) => ({ ...prev, gridSize: gridSize as GridSize }))
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
				onChange={onTagsChange}
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
