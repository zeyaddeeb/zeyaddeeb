"use server";

import {
	type CollectionItem,
	type CollectionItemType,
	collectionItem,
	db,
	type NewCollectionItem,
	type NewPost,
	type Post,
	post,
} from "@zeyaddeeb/db";
import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";

const ALLOWED_ADMIN_ID = process.env.ADMIN_ID || "admin";

export type WriteResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };

async function getAuthenticatedAdminUser(): Promise<
	WriteResult<{ id: string }>
> {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		return { success: false, error: "Unauthorized: Please sign in" };
	}

	if (session.user.id !== ALLOWED_ADMIN_ID) {
		return {
			success: false,
			error: "Forbidden: Only the admin can write",
		};
	}

	return { success: true, data: { id: session.user.id } };
}

export async function getSession() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	return session;
}

const postSchema = z.object({
	title: z.string().min(1, "Title is required"),
	slug: z.string().min(1, "Slug is required"),
	content: z.string().min(1, "Content is required"),
	excerpt: z.string().optional(),
	coverImage: z.string().optional(),
	published: z.boolean().default(false),
	publishedAt: z.date().optional().nullable(),
});

export type PostInput = z.infer<typeof postSchema>;

export async function createPost(
	input: PostInput,
): Promise<WriteResult<{ id: string; slug: string }>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	const validation = postSchema.safeParse(input);
	if (!validation.success) {
		return {
			success: false,
			error: validation.error.issues[0]?.message || "Invalid input",
		};
	}

	try {
		const newPost: NewPost = {
			...validation.data,
			authorId: authResult.data.id,
			publishedAt: validation.data.published
				? (validation.data.publishedAt ?? new Date())
				: null,
		};

		const [created] = await db
			.insert(post)
			.values(newPost)
			.returning({ id: post.id, slug: post.slug });

		if (!created) {
			return { success: false, error: "Failed to create post" };
		}

		return { success: true, data: created };
	} catch (error) {
		console.error("Failed to create post:", error);
		if (error instanceof Error && error.message.includes("unique constraint")) {
			return { success: false, error: "A post with this slug already exists" };
		}
		return { success: false, error: "Failed to create post" };
	}
}

export async function updatePost(
	id: string,
	input: Partial<PostInput>,
): Promise<WriteResult<{ id: string; slug: string }>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	const validation = postSchema.partial().safeParse(input);
	if (!validation.success) {
		return {
			success: false,
			error: validation.error.issues[0]?.message || "Invalid input",
		};
	}

	try {
		const updateData = {
			...validation.data,
			updatedAt: new Date(),
		};

		if (validation.data.published && !validation.data.publishedAt) {
			const [existingPost] = await db
				.select({ publishedAt: post.publishedAt })
				.from(post)
				.where(eq(post.id, id));
			if (!existingPost?.publishedAt) {
				Object.assign(updateData, { publishedAt: new Date() });
			}
		}

		const [updated] = await db
			.update(post)
			.set(updateData)
			.where(eq(post.id, id))
			.returning({ id: post.id, slug: post.slug });

		if (!updated) {
			return { success: false, error: "Post not found" };
		}

		return { success: true, data: updated };
	} catch (error) {
		console.error("Failed to update post:", error);
		if (error instanceof Error && error.message.includes("unique constraint")) {
			return { success: false, error: "A post with this slug already exists" };
		}
		return { success: false, error: "Failed to update post" };
	}
}

export async function deletePost(id: string): Promise<WriteResult<void>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	try {
		const [deleted] = await db
			.delete(post)
			.where(eq(post.id, id))
			.returning({ id: post.id });

		if (!deleted) {
			return { success: false, error: "Post not found" };
		}

		return { success: true, data: undefined };
	} catch (error) {
		console.error("Failed to delete post:", error);
		return { success: false, error: "Failed to delete post" };
	}
}

export async function getPostForEdit(id: string): Promise<WriteResult<Post>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	try {
		const [item] = await db.select().from(post).where(eq(post.id, id)).limit(1);

		if (!item) {
			return { success: false, error: "Post not found" };
		}

		return { success: true, data: item };
	} catch (error) {
		console.error("Failed to fetch post:", error);
		return { success: false, error: "Failed to fetch post" };
	}
}

export async function getAllPostsForAdmin(): Promise<
	WriteResult<
		Array<{
			id: string;
			title: string;
			slug: string;
			published: boolean;
			createdAt: Date;
			updatedAt: Date;
		}>
	>
> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	try {
		const posts = await db
			.select({
				id: post.id,
				title: post.title,
				slug: post.slug,
				published: post.published,
				createdAt: post.createdAt,
				updatedAt: post.updatedAt,
			})
			.from(post)
			.orderBy(desc(post.updatedAt));

		return { success: true, data: posts };
	} catch (error) {
		console.error("Failed to fetch posts:", error);
		return { success: false, error: "Failed to fetch posts" };
	}
}

const collectionItemSchema = z.object({
	type: z.enum([
		"wikipedia",
		"art",
		"book",
		"youtube",
		"product",
		"music",
		"article",
		"podcast",
		"other",
	]),
	title: z.string().min(1, "Title is required"),
	slug: z.string().min(1, "Slug is required"),
	description: z.string().optional().nullable(),
	url: z.string().url().optional().nullable(),
	imageUrl: z.string().url().optional().nullable(),
	thumbnailUrl: z.string().url().optional().nullable(),
	accentColor: z.string().optional().nullable(),
	gridSize: z.enum(["small", "medium", "large"]).default("medium"),
	displayOrder: z.number().default(0),
	metadata: z.record(z.string(), z.unknown()).optional().nullable(),
	tags: z.array(z.string()).default([]),
	featured: z.boolean().default(false),
	published: z.boolean().default(false),
});

export type CollectionItemInput = z.infer<typeof collectionItemSchema>;

export async function createCollectionItem(
	input: CollectionItemInput,
): Promise<WriteResult<{ id: string; slug: string }>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	const validation = collectionItemSchema.safeParse(input);
	if (!validation.success) {
		return {
			success: false,
			error: validation.error.issues[0]?.message || "Invalid input",
		};
	}

	try {
		const newItem: NewCollectionItem = {
			...validation.data,
			authorId: authResult.data.id,
		};

		const [created] = await db
			.insert(collectionItem)
			.values(newItem)
			.returning({ id: collectionItem.id, slug: collectionItem.slug });

		if (!created) {
			return { success: false, error: "Failed to create collection item" };
		}

		return { success: true, data: created };
	} catch (error) {
		console.error("Failed to create collection item:", error);
		if (error instanceof Error && error.message.includes("unique constraint")) {
			return {
				success: false,
				error: "A collection item with this slug already exists",
			};
		}
		return { success: false, error: "Failed to create collection item" };
	}
}

export async function updateCollectionItem(
	id: string,
	input: Partial<CollectionItemInput>,
): Promise<WriteResult<{ id: string; slug: string }>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	const validation = collectionItemSchema.partial().safeParse(input);
	if (!validation.success) {
		return {
			success: false,
			error: validation.error.issues[0]?.message || "Invalid input",
		};
	}

	try {
		const [updated] = await db
			.update(collectionItem)
			.set({
				...validation.data,
				updatedAt: new Date(),
			})
			.where(eq(collectionItem.id, id))
			.returning({ id: collectionItem.id, slug: collectionItem.slug });

		if (!updated) {
			return { success: false, error: "Collection item not found" };
		}

		return { success: true, data: updated };
	} catch (error) {
		console.error("Failed to update collection item:", error);
		if (error instanceof Error && error.message.includes("unique constraint")) {
			return {
				success: false,
				error: "A collection item with this slug already exists",
			};
		}
		return { success: false, error: "Failed to update collection item" };
	}
}

export async function deleteCollectionItem(
	id: string,
): Promise<WriteResult<void>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	try {
		const [deleted] = await db
			.delete(collectionItem)
			.where(eq(collectionItem.id, id))
			.returning({ id: collectionItem.id });

		if (!deleted) {
			return { success: false, error: "Collection item not found" };
		}

		return { success: true, data: undefined };
	} catch (error) {
		console.error("Failed to delete collection item:", error);
		return { success: false, error: "Failed to delete collection item" };
	}
}

export async function getCollectionItemForEdit(
	id: string,
): Promise<WriteResult<CollectionItem>> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	try {
		const [item] = await db
			.select()
			.from(collectionItem)
			.where(eq(collectionItem.id, id))
			.limit(1);

		if (!item) {
			return { success: false, error: "Collection item not found" };
		}

		return { success: true, data: item };
	} catch (error) {
		console.error("Failed to fetch collection item:", error);
		return { success: false, error: "Failed to fetch collection item" };
	}
}

export async function getAllCollectionItemsForAdmin(): Promise<
	WriteResult<
		Array<{
			id: string;
			type: CollectionItemType;
			title: string;
			slug: string;
			published: boolean;
			featured: boolean;
			createdAt: Date;
			updatedAt: Date;
		}>
	>
> {
	const authResult = await getAuthenticatedAdminUser();
	if (!authResult.success) {
		return authResult;
	}

	try {
		const items = await db
			.select({
				id: collectionItem.id,
				type: collectionItem.type,
				title: collectionItem.title,
				slug: collectionItem.slug,
				published: collectionItem.published,
				featured: collectionItem.featured,
				createdAt: collectionItem.createdAt,
				updatedAt: collectionItem.updatedAt,
			})
			.from(collectionItem)
			.orderBy(desc(collectionItem.updatedAt));

		return { success: true, data: items };
	} catch (error) {
		console.error("Failed to fetch collection items:", error);
		return { success: false, error: "Failed to fetch collection items" };
	}
}
