"use server";

import { db, type Post, post } from "@zeyaddeeb/db";
import { and, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { pagination, resultLimit } from "./read-validation";

export interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
}

export interface GetPostsParams {
	page?: number;
	pageSize?: number;
	search?: string;
}

export async function getPosts(
	params: GetPostsParams = {},
): Promise<PaginatedResult<Post>> {
	const { page, pageSize, search } = z
		.object({ ...pagination, pageSize: pagination.pageSize.default(10) })
		.parse(params);

	try {
		const offset = (page - 1) * pageSize;

		const conditions: (SQL | undefined)[] = [eq(post.published, true)];

		if (search) {
			conditions.push(
				or(
					ilike(post.title, `%${search}%`),
					ilike(post.content, `%${search}%`),
					ilike(post.excerpt, `%${search}%`),
				),
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const countResult = await db
			.select({ totalCount: count() })
			.from(post)
			.where(whereClause);

		const totalCount = countResult[0]?.totalCount ?? 0;

		const items = await db
			.select()
			.from(post)
			.where(whereClause)
			.orderBy(desc(post.publishedAt), desc(post.createdAt))
			.limit(pageSize)
			.offset(offset);

		const totalPages = Math.ceil(totalCount / pageSize);

		return {
			items,
			total: totalCount,
			page,
			pageSize,
			totalPages,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1,
		};
	} catch (error) {
		console.error("Failed to fetch posts:", error);
		return {
			items: [],
			total: 0,
			page,
			pageSize,
			totalPages: 0,
			hasNextPage: false,
			hasPreviousPage: false,
		};
	}
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
	try {
		const [item] = await db
			.select()
			.from(post)
			.where(and(eq(post.slug, slug), eq(post.published, true)))
			.limit(1);

		return item ?? null;
	} catch (error) {
		console.error("Failed to fetch post by slug:", error);
		return null;
	}
}

export async function getRecentPosts(limit = 5): Promise<Post[]> {
	try {
		return await db
			.select()
			.from(post)
			.where(eq(post.published, true))
			.orderBy(desc(post.publishedAt), desc(post.createdAt))
			.limit(resultLimit.parse(limit));
	} catch (error) {
		console.error("Failed to fetch recent posts:", error);
		return [];
	}
}

export async function getRelatedPosts(
	currentPostId: string,
	limit = 3,
): Promise<Post[]> {
	try {
		return await db
			.select()
			.from(post)
			.where(and(eq(post.published, true), sql`${post.id} != ${currentPostId}`))
			.orderBy(desc(post.publishedAt), desc(post.createdAt))
			.limit(resultLimit.parse(limit));
	} catch (error) {
		console.error("Failed to fetch related posts:", error);
		return [];
	}
}
