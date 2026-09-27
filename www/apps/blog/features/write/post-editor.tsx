"use client";

import type { Post } from "@zeyaddeeb/db/schema";
import { useState } from "react";
import {
	createPost,
	deletePost,
	type PostInput,
	updatePost,
} from "@/lib/actions/write";
import {
	DeleteButton,
	ErrorAlert,
	FormActions,
	PageHeader,
	type WriterUser,
} from "./form-layout";
import { PostFormFields } from "./post-form";
import { useEditorActions } from "./use-editor-actions";

const EMPTY_POST: PostInput = {
	title: "",
	slug: "",
	content: "",
	excerpt: "",
	coverImage: "",
	published: false,
	publishedAt: null,
};

function toInput(post: Post): PostInput {
	return {
		title: post.title,
		slug: post.slug,
		content: post.content,
		excerpt: post.excerpt || "",
		coverImage: post.coverImage || "",
		published: post.published,
		publishedAt: post.publishedAt,
	};
}

interface PostEditorProps {
	user: WriterUser;
	post?: Post;
}

export function PostEditor({ user, post }: PostEditorProps) {
	const [formData, setFormData] = useState<PostInput>(() =>
		post ? toInput(post) : EMPTY_POST,
	);

	const actions = useEditorActions({
		save: () => (post ? updatePost(post.id, formData) : createPost(formData)),
		savedHref: ({ slug }) => (formData.published ? `/posts/${slug}` : "/write"),
		remove: post ? () => deletePost(post.id) : undefined,
		removedHref: "/posts",
		noun: "post",
	});

	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-4xl mx-auto">
				<PageHeader title={post ? "Edit Post" : "Write a Post"} user={user} />

				<ErrorAlert error={actions.error} />

				<form onSubmit={actions.submit} className="space-y-6">
					<PostFormFields
						formData={formData}
						setFormData={setFormData}
						autoSlug={!post}
					/>

					<FormActions
						isSubmitting={actions.isSubmitting}
						submitLabel={post ? "Save Changes" : "Create Post"}
						submittingLabel={post ? "Saving..." : "Creating..."}
						onCancel={actions.cancel}
						deleteButton={
							post && (
								<DeleteButton
									onClick={actions.destroy}
									isDeleting={actions.isDeleting}
									label="Delete Post"
								/>
							)
						}
					/>
				</form>
			</div>
		</main>
	);
}
