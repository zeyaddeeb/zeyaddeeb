"use server";

import { db, type Post, post } from "@zeyaddeeb/db";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
	type PaginatedResult,
	POSTS_PAGE_SIZE,
	paginatedResult,
} from "../pagination";
import { pagination, resultLimit } from "./read-validation";

export interface GetPostsParams {
	page?: number;
	pageSize?: number;
	search?: string;
}

export async function getPosts(
	params: GetPostsParams = {},
): Promise<PaginatedResult<Post>> {
	const { page, pageSize, search } = z
		.object({
			...pagination,
			pageSize: pagination.pageSize.default(POSTS_PAGE_SIZE),
		})
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

		return paginatedResult(items, totalCount, page, pageSize);
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
