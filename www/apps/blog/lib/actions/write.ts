"use server";

import {
	type CollectionItem,
	collectionItem,
	db,
	desc,
	eq,
	type Post,
	post,
} from "@zeyaddeeb/db";
import {
	COLLECTION_ITEM_TYPES,
	GRID_SIZES,
} from "@zeyaddeeb/db/collection-options";
import { z } from "zod";
import { getSession, isAdmin } from "@/lib/session";
import {
	fail,
	firstIssue,
	isUniqueViolation,
	ok,
	type WriteResult,
} from "./result";

const postSchema = z.object({
	title: z.string().min(1, "Title is required"),
	slug: z.string().min(1, "Slug is required"),
	content: z.string().min(1, "Content is required"),
	excerpt: z.string().optional(),
	coverImage: z.string().optional(),
	published: z.boolean().default(false),
	publishedAt: z.date().optional().nullable(),
});

const collectionItemSchema = z.object({
	type: z.enum(COLLECTION_ITEM_TYPES),
	title: z.string().min(1, "Title is required"),
	slug: z.string().min(1, "Slug is required"),
	description: z.string().optional().nullable(),
	url: z.string().optional().nullable(),
	imageUrl: z.string().optional().nullable(),
	thumbnailUrl: z.string().optional().nullable(),
	accentColor: z.string().optional().nullable(),
	gridSize: z.enum(GRID_SIZES).default("medium"),
	displayOrder: z.number().default(0),
	metadata: z.record(z.string(), z.unknown()).optional().nullable(),
	tags: z.array(z.string()).default([]),
	featured: z.boolean().default(false),
	published: z.boolean().default(false),
});

export type PostInput = z.infer<typeof postSchema>;
export type CollectionItemInput = z.infer<typeof collectionItemSchema>;
export type Written = { id: string; slug: string };

const adminPostColumns = {
	id: post.id,
	title: post.title,
	slug: post.slug,
	published: post.published,
	createdAt: post.createdAt,
	updatedAt: post.updatedAt,
};

const adminCollectionColumns = {
	id: collectionItem.id,
	type: collectionItem.type,
	title: collectionItem.title,
	slug: collectionItem.slug,
	published: collectionItem.published,
	featured: collectionItem.featured,
	createdAt: collectionItem.createdAt,
	updatedAt: collectionItem.updatedAt,
};

export type AdminPostRow = Pick<Post, keyof typeof adminPostColumns>;
export type AdminCollectionRow = Pick<
	CollectionItem,
	keyof typeof adminCollectionColumns
>;

async function asAdmin<T>(
	failure: string,
	run: (adminId: string) => Promise<WriteResult<T>>,
	duplicate?: string,
): Promise<WriteResult<T>> {
	if (!process.env.ADMIN_ID) return fail("Server misconfigured");

	const session = await getSession();

	if (!session?.user) return fail("Unauthorized: Please sign in");

	if (!isAdmin(session.user))
		return fail("Forbidden: Only the admin can write");

	try {
		return await run(session.user.id);
	} catch (error) {
		console.error(`${failure}:`, error);

		if (duplicate && isUniqueViolation(error)) return fail(duplicate);

		return fail(failure);
	}
}

const DUPLICATE_POST = "A post with this slug already exists";
const DUPLICATE_ITEM = "A collection item with this slug already exists";

export async function createPost(
	input: PostInput,
): Promise<WriteResult<Written>> {
	return asAdmin(
		"Failed to create post",
		async (authorId) => {
			const parsed = postSchema.safeParse(input);

			if (!parsed.success) return fail(firstIssue(parsed.error));

			const [created] = await db
				.insert(post)
				.values({
					...parsed.data,
					authorId,
					publishedAt: parsed.data.published
						? (parsed.data.publishedAt ?? new Date())
						: null,
				})
				.returning({ id: post.id, slug: post.slug });

			return created ? ok(created) : fail("Failed to create post");
		},
		DUPLICATE_POST,
	);
}

export async function updatePost(
	id: string,
	input: Partial<PostInput>,
): Promise<WriteResult<Written>> {
	return asAdmin(
		"Failed to update post",
		async () => {
			const parsed = postSchema.partial().safeParse(input);

			if (!parsed.success) return fail(firstIssue(parsed.error));

			const changes = { ...parsed.data, updatedAt: new Date() };

			if (parsed.data.published && !parsed.data.publishedAt) {
				const [existing] = await db
					.select({ publishedAt: post.publishedAt })
					.from(post)
					.where(eq(post.id, id));

				if (!existing?.publishedAt) changes.publishedAt = new Date();
			}

			const [updated] = await db
				.update(post)
				.set(changes)
				.where(eq(post.id, id))
				.returning({ id: post.id, slug: post.slug });

			return updated ? ok(updated) : fail("Post not found");
		},
		DUPLICATE_POST,
	);
}

export async function deletePost(id: string): Promise<WriteResult<void>> {
	return asAdmin("Failed to delete post", async () => {
		const [deleted] = await db
			.delete(post)
			.where(eq(post.id, id))
			.returning({ id: post.id });

		return deleted ? ok(undefined) : fail("Post not found");
	});
}

export async function getPostForEdit(id: string): Promise<WriteResult<Post>> {
	return asAdmin("Failed to fetch post", async () => {
		const [item] = await db.select().from(post).where(eq(post.id, id)).limit(1);

		return item ? ok(item) : fail("Post not found");
	});
}

export async function getAllPostsForAdmin(): Promise<
	WriteResult<AdminPostRow[]>
> {
	return asAdmin("Failed to fetch posts", async () =>
		ok(
			await db
				.select(adminPostColumns)
				.from(post)
				.orderBy(desc(post.updatedAt)),
		),
	);
}

export async function createCollectionItem(
	input: CollectionItemInput,
): Promise<WriteResult<Written>> {
	return asAdmin(
		"Failed to create collection item",
		async (authorId) => {
			const parsed = collectionItemSchema.safeParse(input);

			if (!parsed.success) return fail(firstIssue(parsed.error));

			const [created] = await db
				.insert(collectionItem)
				.values({ ...parsed.data, authorId })
				.returning({ id: collectionItem.id, slug: collectionItem.slug });

			return created ? ok(created) : fail("Failed to create collection item");
		},
		DUPLICATE_ITEM,
	);
}

export async function updateCollectionItem(
	id: string,
	input: Partial<CollectionItemInput>,
): Promise<WriteResult<Written>> {
	return asAdmin(
		"Failed to update collection item",
		async () => {
			const parsed = collectionItemSchema.partial().safeParse(input);

			if (!parsed.success) return fail(firstIssue(parsed.error));

			const [updated] = await db
				.update(collectionItem)
				.set({ ...parsed.data, updatedAt: new Date() })
				.where(eq(collectionItem.id, id))
				.returning({ id: collectionItem.id, slug: collectionItem.slug });

			return updated ? ok(updated) : fail("Collection item not found");
		},
		DUPLICATE_ITEM,
	);
}

export async function deleteCollectionItem(
	id: string,
): Promise<WriteResult<void>> {
	return asAdmin("Failed to delete collection item", async () => {
		const [deleted] = await db
			.delete(collectionItem)
			.where(eq(collectionItem.id, id))
			.returning({ id: collectionItem.id });

		return deleted ? ok(undefined) : fail("Collection item not found");
	});
}

export async function getCollectionItemForEdit(
	id: string,
): Promise<WriteResult<CollectionItem>> {
	return asAdmin("Failed to fetch collection item", async () => {
		const [item] = await db
			.select()
			.from(collectionItem)
			.where(eq(collectionItem.id, id))
			.limit(1);

		return item ? ok(item) : fail("Collection item not found");
	});
}

export async function getAllCollectionItemsForAdmin(): Promise<
	WriteResult<AdminCollectionRow[]>
> {
	return asAdmin("Failed to fetch collection items", async () =>
		ok(
			await db
				.select(adminCollectionColumns)
				.from(collectionItem)
				.orderBy(desc(collectionItem.updatedAt)),
		),
	);
}
