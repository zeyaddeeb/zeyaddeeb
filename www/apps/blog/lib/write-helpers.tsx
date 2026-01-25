"use client";

import type { CollectionItemType } from "@zeyaddeeb/db";
import Image from "next/image";
import type { ReactNode } from "react";
import { signOutAction } from "@/lib/actions/auth";
import type { CollectionItemInput } from "@/lib/actions/write";
import { getTypeIcon, getTypeLabel } from "@/lib/collection-utils";

export const ITEM_TYPES: CollectionItemType[] = [
	"book",
	"art",
	"youtube",
	"music",
	"article",
	"podcast",
	"product",
	"wikipedia",
	"other",
];

export const GRID_SIZES = ["small", "medium", "large"] as const;
export type GridSize = (typeof GRID_SIZES)[number];

export function generateSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export interface User {
	id: string;
	name: string;
	email: string;
}

const inputBaseClass =
	"w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 transition-colors";

interface FormFieldProps {
	label: string;
	id: string;
	required?: boolean;
	children: ReactNode;
}

export function FormField({ label, id, required, children }: FormFieldProps) {
	return (
		<div>
			<label htmlFor={id} className="block text-sm font-medium mb-2">
				{label}
				{required && <span className="text-red-400 ml-1">*</span>}
			</label>
			{children}
		</div>
	);
}

interface TextInputProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	required?: boolean;
	type?: "text" | "url" | "number";
}

export function TextInput({
	id,
	label,
	value,
	onChange,
	placeholder,
	required,
	type = "text",
}: TextInputProps) {
	return (
		<FormField label={label} id={id} required={required}>
			<input
				id={id}
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={inputBaseClass}
				placeholder={placeholder}
				required={required}
			/>
		</FormField>
	);
}

interface TextAreaInputProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	required?: boolean;
	className?: string;
}

export function TextAreaInput({
	id,
	label,
	value,
	onChange,
	placeholder,
	rows = 3,
	required,
	className,
}: TextAreaInputProps) {
	return (
		<FormField label={label} id={id} required={required}>
			<textarea
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={rows}
				className={`${inputBaseClass} ${className || ""}`}
				placeholder={placeholder}
				required={required}
			/>
		</FormField>
	);
}

interface SelectInputProps<T extends string> {
	id: string;
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: readonly T[];
	getOptionLabel?: (option: T) => string;
}

export function SelectInput<T extends string>({
	id,
	label,
	value,
	onChange,
	options,
	getOptionLabel = (o) => o.charAt(0).toUpperCase() + o.slice(1),
}: SelectInputProps<T>) {
	return (
		<FormField label={label} id={id}>
			<select
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value as T)}
				className={inputBaseClass}
			>
				{options.map((option) => (
					<option key={option} value={option}>
						{getOptionLabel(option)}
					</option>
				))}
			</select>
		</FormField>
	);
}

interface CheckboxInputProps {
	id: string;
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}

export function CheckboxInput({
	id,
	label,
	checked,
	onChange,
}: CheckboxInputProps) {
	return (
		<div className="flex items-center gap-3">
			<input
				id={id}
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="w-4 h-4 bg-neutral-900 border-neutral-800 rounded focus:ring-neutral-600"
			/>
			<label htmlFor={id} className="text-sm">
				{label}
			</label>
		</div>
	);
}

interface ColorPickerProps {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export function ColorPicker({
	id,
	label,
	value,
	onChange,
	placeholder = "#ff6b6b",
}: ColorPickerProps) {
	return (
		<FormField label={label} id={id}>
			<div className="flex gap-2">
				<input
					id={id}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className={`flex-1 ${inputBaseClass}`}
					placeholder={placeholder}
				/>
				<input
					type="color"
					value={value || "#ffffff"}
					onChange={(e) => onChange(e.target.value)}
					className="w-12 h-12 rounded-lg cursor-pointer bg-neutral-900 border border-neutral-800"
				/>
			</div>
		</FormField>
	);
}

interface NumberInputProps {
	id: string;
	label: string;
	value: number;
	onChange: (value: number) => void;
}

export function NumberInput({ id, label, value, onChange }: NumberInputProps) {
	return (
		<FormField label={label} id={id}>
			<input
				id={id}
				type="number"
				value={value}
				onChange={(e) => onChange(Number.parseInt(e.target.value) || 0)}
				className={inputBaseClass}
			/>
		</FormField>
	);
}

interface PageHeaderProps {
	title: string;
	user: User;
	actions?: ReactNode;
}

export function PageHeader({ title, user, actions }: PageHeaderProps) {
	const handleSignOut = async () => {
		await signOutAction();
		window.location.href = "/blog/write/login";
	};

	return (
		<div className="flex justify-between items-center mb-8">
			<h1 className="text-3xl font-bold">{title}</h1>
			<div className="flex items-center gap-4">
				{actions}
				<span className="text-neutral-400 text-sm">
					Signed in as {user.name}
				</span>
				<button
					type="button"
					onClick={handleSignOut}
					className="text-sm text-neutral-400 hover:text-white transition-colors"
				>
					Sign out
				</button>
			</div>
		</div>
	);
}

interface ErrorAlertProps {
	error: string | null;
}

export function ErrorAlert({ error }: ErrorAlertProps) {
	if (!error) return null;

	return (
		<div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
			{error}
		</div>
	);
}

interface FormActionsProps {
	isSubmitting: boolean;
	submitLabel: string;
	submittingLabel: string;
	onCancel: () => void;
	deleteButton?: ReactNode;
}

export function FormActions({
	isSubmitting,
	submitLabel,
	submittingLabel,
	onCancel,
	deleteButton,
}: FormActionsProps) {
	return (
		<div className={deleteButton ? "flex justify-between" : "flex gap-4"}>
			<div className="flex gap-4">
				<button
					type="submit"
					disabled={isSubmitting}
					className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? submittingLabel : submitLabel}
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="px-6 py-3 border border-neutral-700 rounded-lg hover:bg-neutral-900 transition-colors"
				>
					Cancel
				</button>
			</div>
			{deleteButton}
		</div>
	);
}

interface DeleteButtonProps {
	onClick: () => void;
	isDeleting: boolean;
	label?: string;
	deletingLabel?: string;
}

export function DeleteButton({
	onClick,
	isDeleting,
	label = "Delete",
	deletingLabel = "Deleting...",
}: DeleteButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isDeleting}
			className="px-6 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{isDeleting ? deletingLabel : label}
		</button>
	);
}

interface PreviewToggleProps {
	showPreview: boolean;
	onToggle: () => void;
}

export function PreviewToggle({ showPreview, onToggle }: PreviewToggleProps) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={`px-4 py-2 rounded-lg transition-colors ${
				showPreview
					? "bg-white text-black"
					: "border border-neutral-700 hover:bg-neutral-900"
			}`}
		>
			{showPreview ? "Hide Preview" : "Show Preview"}
		</button>
	);
}

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
					id="type"
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
					id="gridSize"
					label="Grid Size"
					value={formData.gridSize}
					onChange={(gridSize) =>
						setFormData((prev) => ({ ...prev, gridSize: gridSize as GridSize }))
					}
					options={GRID_SIZES}
				/>
			</div>

			<TextInput
				id="title"
				label="Title"
				value={formData.title}
				onChange={handleTitleChange}
				placeholder="Item title"
				required
			/>

			<TextInput
				id="slug"
				label="Slug"
				value={formData.slug}
				onChange={(slug) => setFormData((prev) => ({ ...prev, slug }))}
				placeholder="item-slug"
				required
			/>

			<TextAreaInput
				id="description"
				label="Description"
				value={formData.description || ""}
				onChange={(description) =>
					setFormData((prev) => ({ ...prev, description }))
				}
				placeholder="Brief description"
			/>

			<TextInput
				id="url"
				label="URL"
				value={formData.url || ""}
				onChange={(url) => setFormData((prev) => ({ ...prev, url }))}
				placeholder="https://example.com"
				type="url"
			/>

			<TextInput
				id="imageUrl"
				label="Image URL"
				value={formData.imageUrl || ""}
				onChange={(imageUrl) => setFormData((prev) => ({ ...prev, imageUrl }))}
				placeholder="https://example.com/image.jpg"
				type="url"
			/>

			<div className="grid grid-cols-2 gap-4">
				<ColorPicker
					id="accentColor"
					label="Accent Color"
					value={formData.accentColor || ""}
					onChange={(accentColor) =>
						setFormData((prev) => ({ ...prev, accentColor }))
					}
				/>

				<NumberInput
					id="displayOrder"
					label="Display Order"
					value={formData.displayOrder || 0}
					onChange={(displayOrder) =>
						setFormData((prev) => ({ ...prev, displayOrder }))
					}
				/>
			</div>

			<TextInput
				id="tags"
				label="Tags (comma-separated)"
				value={tagsInput}
				onChange={onTagsChange}
				placeholder="design, inspiration, tech"
			/>

			<div className="flex items-center gap-6">
				<CheckboxInput
					id="featured"
					label="Featured"
					checked={formData.featured || false}
					onChange={(featured) =>
						setFormData((prev) => ({ ...prev, featured }))
					}
				/>

				<CheckboxInput
					id="published"
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

interface PostFormFieldsProps {
	formData: {
		title: string;
		slug: string;
		content: string;
		excerpt?: string;
		coverImage?: string;
		published: boolean;
	};
	setFormData: React.Dispatch<
		React.SetStateAction<PostFormFieldsProps["formData"]>
	>;
	onTitleChange?: (title: string) => void;
}

export function PostFormFields({
	formData,
	setFormData,
	onTitleChange,
}: PostFormFieldsProps) {
	const handleTitleChange = (title: string) => {
		if (onTitleChange) {
			onTitleChange(title);
		} else {
			setFormData((prev: typeof formData) => ({ ...prev, title }));
		}
	};

	return (
		<>
			<TextInput
				id="title"
				label="Title"
				value={formData.title}
				onChange={handleTitleChange}
				placeholder="Post title"
				required
			/>

			<TextInput
				id="slug"
				label="Slug"
				value={formData.slug}
				onChange={(slug) =>
					setFormData((prev: typeof formData) => ({ ...prev, slug }))
				}
				placeholder="post-slug"
				required
			/>

			<TextInput
				id="excerpt"
				label="Excerpt"
				value={formData.excerpt || ""}
				onChange={(excerpt) =>
					setFormData((prev: typeof formData) => ({ ...prev, excerpt }))
				}
				placeholder="Brief description of the post"
			/>

			<TextInput
				id="coverImage"
				label="Cover Image URL"
				value={formData.coverImage || ""}
				onChange={(coverImage) =>
					setFormData((prev: typeof formData) => ({ ...prev, coverImage }))
				}
				placeholder="https://example.com/image.jpg"
				type="url"
			/>

			<TextAreaInput
				id="content"
				label="Content"
				value={formData.content}
				onChange={(content) =>
					setFormData((prev: typeof formData) => ({ ...prev, content }))
				}
				rows={20}
				className="font-mono text-sm"
				placeholder="Write your post content here (Markdown supported)"
				required
			/>

			<CheckboxInput
				id="published"
				label="Publish immediately"
				checked={formData.published}
				onChange={(published) =>
					setFormData((prev: typeof formData) => ({ ...prev, published }))
				}
			/>
		</>
	);
}
