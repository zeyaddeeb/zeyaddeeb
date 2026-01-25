"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	type CollectionItemInput,
	createCollectionItem,
} from "@/lib/actions/write";
import {
	CollectionFormFields,
	CollectionPreview,
	ErrorAlert,
	FormActions,
	generateSlug,
	PageHeader,
	PreviewToggle,
	type User,
} from "@/lib/write-helpers";

interface CollectionWriteClientProps {
	user: User;
}

export function CollectionWriteClient({ user }: CollectionWriteClientProps) {
	const router = useRouter();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showPreview, setShowPreview] = useState(false);

	const [formData, setFormData] = useState<CollectionItemInput>({
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
	});

	const [tagsInput, setTagsInput] = useState("");

	const handleTitleChange = (title: string) => {
		setFormData((prev) => ({
			...prev,
			title,
			slug: prev.slug || generateSlug(title),
		}));
	};

	const handleTagsChange = (value: string) => {
		setTagsInput(value);
		const tags = value
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		setFormData((prev) => ({ ...prev, tags }));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const result = await createCollectionItem(formData);

		if (result.success) {
			router.push(`/things-i-like/${result.data.slug}`);
		} else {
			setError(result.error);
			setIsSubmitting(false);
		}
	};

	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-6xl mx-auto">
				<PageHeader
					title="Add to Things I Like"
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
							onTitleChange={handleTitleChange}
						/>

						<FormActions
							isSubmitting={isSubmitting}
							submitLabel="Create Item"
							submittingLabel="Creating..."
							onCancel={() => router.back()}
						/>
					</form>

					{showPreview && <CollectionPreview formData={formData} />}
				</div>
			</div>
		</main>
	);
}
