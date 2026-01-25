"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPost, type PostInput } from "@/lib/actions/write";
import {
	ErrorAlert,
	FormActions,
	generateSlug,
	PageHeader,
	PostFormFields,
	type User,
} from "@/lib/write-helpers";

interface WriteClientProps {
	user: User;
}

export function WriteClient({ user }: WriteClientProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [formData, setFormData] = useState<PostInput>({
		title: "",
		slug: "",
		content: "",
		excerpt: "",
		coverImage: "",
		published: false,
		publishedAt: null,
	});

	const handleTitleChange = (title: string) => {
		setFormData((prev) => ({
			...prev,
			title,
			slug: prev.slug || generateSlug(title),
		}));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const result = await createPost(formData);

		if (result.success) {
			router.push(`/posts/${result.data.slug}`);
		} else {
			setError(result.error);
			setIsSubmitting(false);
		}
	};

	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-4xl mx-auto">
				<PageHeader title="Write a Post" user={user} />

				<ErrorAlert error={error} />

				<form onSubmit={handleSubmit} className="space-y-6">
					<PostFormFields
						formData={formData}
						setFormData={setFormData}
						onTitleChange={handleTitleChange}
					/>

					<FormActions
						isSubmitting={isSubmitting}
						submitLabel="Create Post"
						submittingLabel="Creating..."
						onCancel={() => router.back()}
					/>
				</form>
			</div>
		</main>
	);
}
