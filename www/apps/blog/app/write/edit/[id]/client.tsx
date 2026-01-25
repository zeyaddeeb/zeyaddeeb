"use client";

import type { Post } from "@zeyaddeeb/db";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePost, type PostInput, updatePost } from "@/lib/actions/write";
import {
	DeleteButton,
	ErrorAlert,
	FormActions,
	PageHeader,
	PostFormFields,
	type User,
} from "@/lib/write-helpers";

interface EditClientProps {
	user: User;
	post: Post;
}

export function EditClient({ user, post }: EditClientProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [formData, setFormData] = useState<PostInput>({
		title: post.title,
		slug: post.slug,
		content: post.content,
		excerpt: post.excerpt || "",
		coverImage: post.coverImage || "",
		published: post.published,
		publishedAt: post.publishedAt,
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const result = await updatePost(post.id, formData);

		if (result.success) {
			router.push(`/posts/${result.data.slug}`);
		} else {
			setError(result.error);
			setIsSubmitting(false);
		}
	};

	const handleDelete = async () => {
		if (
			!confirm(
				"Are you sure you want to delete this post? This action cannot be undone.",
			)
		) {
			return;
		}

		setIsDeleting(true);
		setError(null);

		const result = await deletePost(post.id);

		if (result.success) {
			router.push("/posts");
		} else {
			setError(result.error);
			setIsDeleting(false);
		}
	};

	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-4xl mx-auto">
				<PageHeader title="Edit Post" user={user} />

				<ErrorAlert error={error} />

				<form onSubmit={handleSubmit} className="space-y-6">
					<PostFormFields formData={formData} setFormData={setFormData} />

					<FormActions
						isSubmitting={isSubmitting}
						submitLabel="Save Changes"
						submittingLabel="Saving..."
						onCancel={() => router.back()}
						deleteButton={
							<DeleteButton
								onClick={handleDelete}
								isDeleting={isDeleting}
								label="Delete Post"
							/>
						}
					/>
				</form>
			</div>
		</main>
	);
}
