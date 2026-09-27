"use server";

import {
	and,
	count,
	db,
	desc,
	eq,
	ilike,
	or,
	type Post,
	post,
	type SQL,
} from "@zeyaddeeb/db";
import { z } from "zod";
import {
	emptyPage,
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

const postsQuery = z.object({
	...pagination,
	pageSize: pagination.pageSize.default(POSTS_PAGE_SIZE),
});

export async function getPosts(
	params: GetPostsParams = {},
): Promise<PaginatedResult<Post>> {
	const parsed = postsQuery.safeParse(params);
	const { page, pageSize, search } = parsed.success
		? parsed.data
		: postsQuery.parse({});

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
		return emptyPage(page, pageSize);
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
