"use client";

import dynamic from "next/dynamic";
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
				label="Title"
				value={formData.title}
				onChange={handleTitleChange}
				placeholder="Post title"
				required
			/>

			<TextInput
				label="Slug"
				value={formData.slug}
				onChange={(slug) =>
					setFormData((prev: typeof formData) => ({ ...prev, slug }))
				}
				placeholder="post-slug"
				required
			/>

			<TextInput
				label="Excerpt"
				value={formData.excerpt || ""}
				onChange={(excerpt) =>
					setFormData((prev: typeof formData) => ({ ...prev, excerpt }))
				}
				placeholder="Brief description of the post"
			/>

			<TextInput
				label="Cover Image URL"
				value={formData.coverImage || ""}
				onChange={(coverImage) =>
					setFormData((prev: typeof formData) => ({ ...prev, coverImage }))
				}
				placeholder="https://example.com/image.jpg"
				type="url"
			/>

			<FormField label="Content" htmlFor="content" required>
				<MarkdownEditor
					value={formData.content}
					onChange={(content) =>
						setFormData((prev: typeof formData) => ({ ...prev, content }))
					}
					placeholder="Write your post content here..."
				/>
			</FormField>

			<CheckboxInput
				label="Publish immediately"
				checked={formData.published}
				onChange={(published) =>
					setFormData((prev: typeof formData) => ({ ...prev, published }))
				}
			/>
		</>
	);
}
