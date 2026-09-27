"use server";

import {
	and,
	arrayOverlaps,
	asc,
	type CollectionItem,
	type CollectionItemType,
	collectionItem,
	count,
	db,
	desc,
	eq,
	sql,
} from "@zeyaddeeb/db";
import { COLLECTION_ITEM_TYPES } from "@zeyaddeeb/db/collection-options";
import { z } from "zod";
import {
	COLLECTION_PAGE_SIZE,
	emptyPage,
	type PaginatedResult,
	paginatedResult,
} from "../pagination";
import { pagination, resultLimit } from "./read-validation";

export interface GetCollectionItemsParams {
	page?: number;
	pageSize?: number;
	type?: CollectionItemType | null;
	tags?: string[];
	search?: string;
	featured?: boolean;
}

const collectionQuery = z.object({
	...pagination,
	pageSize: pagination.pageSize.default(COLLECTION_PAGE_SIZE),
	type: z.enum(COLLECTION_ITEM_TYPES).nullable().default(null),
	tags: z.array(z.string().min(1).max(64)).max(20).default([]),
	search: z.string().max(256).default(""),
	featured: z.boolean().optional(),
});

export async function getCollectionItems(
	params: GetCollectionItemsParams = {},
): Promise<PaginatedResult<CollectionItem>> {
	const parsed = collectionQuery.safeParse(params);
	const { page, pageSize, type, tags, search, featured } = parsed.success
		? parsed.data
		: collectionQuery.parse({});

	try {
		const offset = (page - 1) * pageSize;

		const conditions = [eq(collectionItem.published, true)];

		if (type) {
			conditions.push(eq(collectionItem.type, type));
		}

		if (featured !== undefined) {
			conditions.push(eq(collectionItem.featured, featured));
		}

		if (tags.length > 0) {
			conditions.push(arrayOverlaps(collectionItem.tags, tags));
		}

		if (search.trim()) {
			const searchTerm = `%${search.trim().toLowerCase()}%`;
			conditions.push(
				sql`(LOWER(${collectionItem.title}) LIKE ${searchTerm} OR LOWER(${collectionItem.description}) LIKE ${searchTerm})`,
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const countResult = await db
			.select({ totalCount: count() })
			.from(collectionItem)
			.where(whereClause);

		const totalCount = countResult[0]?.totalCount ?? 0;

		const items = await db
			.select()
			.from(collectionItem)
			.where(whereClause)
			.orderBy(
				desc(collectionItem.featured),
				asc(sql`NULLIF(${collectionItem.displayOrder}, 0)`),
				desc(collectionItem.createdAt),
			)
			.limit(pageSize)
			.offset(offset);

		return paginatedResult(items, totalCount, page, pageSize);
	} catch (error) {
		console.error("Failed to fetch collection items:", error);
		return emptyPage(page, pageSize);
	}
}

export async function getCollectionItemBySlug(
	slug: string,
): Promise<CollectionItem | null> {
	try {
		const [item] = await db
			.select()
			.from(collectionItem)
			.where(
				and(eq(collectionItem.slug, slug), eq(collectionItem.published, true)),
			)
			.limit(1);

		return item ?? null;
	} catch (error) {
		console.error("Failed to fetch collection item by slug:", error);
		return null;
	}
}

export async function getAllCollectionTypes(): Promise<CollectionItemType[]> {
	try {
		const result = await db
			.selectDistinct({ type: collectionItem.type })
			.from(collectionItem)
			.where(eq(collectionItem.published, true));

		return result.map((r) => r.type);
	} catch (error) {
		console.error("Failed to fetch collection types:", error);
		return [];
	}
}

export async function getTopCollectionItems(
	limit = 6,
): Promise<CollectionItem[]> {
	try {
		return await db
			.select()
			.from(collectionItem)
			.where(eq(collectionItem.published, true))
			.orderBy(
				asc(sql`NULLIF(${collectionItem.displayOrder}, 0)`),
				desc(collectionItem.createdAt),
			)
			.limit(resultLimit.parse(limit));
	} catch (error) {
		console.error("Failed to fetch top collection items:", error);
		return [];
	}
}
