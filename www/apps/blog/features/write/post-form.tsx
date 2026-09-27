"use client";

import dynamic from "next/dynamic";
import type { PostInput } from "@/lib/actions/write";
import { generateSlug } from "@/lib/slug";
import { CheckboxInput, FormField, TextInput } from "./form-inputs";

const MarkdownEditor = dynamic(
	() =>
		import("@/components/markdown-editor").then((mod) => mod.MarkdownEditor),
	{
		ssr: false,
		loading: () => (
			<div className="h-125 bg-neutral-900 rounded-lg animate-pulse" />
		),
	},
);

interface PostFormFieldsProps {
	formData: PostInput;
	setFormData: React.Dispatch<React.SetStateAction<PostInput>>;
	autoSlug?: boolean;
}

export function PostFormFields({
	formData,
	setFormData,
	autoSlug,
}: PostFormFieldsProps) {
	const handleTitleChange = (title: string) =>
		setFormData((prev) => ({
			...prev,
			title,
			slug: autoSlug && !prev.slug ? generateSlug(title) : prev.slug,
		}));

	return (
		<>
			<TextInput
				label="Title"
				value={formData.title}
				onChange={handleTitleChange}
				placeholder="Post title"
				required
			/>

			<TextInput
				label="Slug"
				value={formData.slug}
				onChange={(slug) => setFormData((prev) => ({ ...prev, slug }))}
				placeholder="post-slug"
				required
			/>

			<TextInput
				label="Excerpt"
				value={formData.excerpt || ""}
				onChange={(excerpt) => setFormData((prev) => ({ ...prev, excerpt }))}
				placeholder="Brief description of the post"
			/>

			<TextInput
				label="Cover Image URL"
				value={formData.coverImage || ""}
				onChange={(coverImage) =>
					setFormData((prev) => ({ ...prev, coverImage }))
				}
				placeholder="https://example.com/image.jpg"
				type="url"
			/>

			<FormField label="Content" htmlFor="content" required>
				<MarkdownEditor
					value={formData.content}
					onChange={(content) => setFormData((prev) => ({ ...prev, content }))}
					placeholder="Write your post content here..."
				/>
			</FormField>

			<CheckboxInput
				label="Publish immediately"
				checked={formData.published}
				onChange={(published) =>
					setFormData((prev) => ({ ...prev, published }))
				}
			/>
		</>
	);
}
