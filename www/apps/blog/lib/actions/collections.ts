"use server";

import {
	type CollectionItem,
	type CollectionItemType,
	collectionItem,
	db,
} from "@zeyaddeeb/db";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";

export interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
}

export interface GetCollectionItemsParams {
	page?: number;
	pageSize?: number;
	type?: CollectionItemType | null;
	tags?: string[];
	search?: string;
	featured?: boolean;
	published?: boolean;
}

export async function getCollectionItems(
	params: GetCollectionItemsParams = {},
): Promise<PaginatedResult<CollectionItem>> {
	const {
		page = 1,
		pageSize = 12,
		type = null,
		tags = [],
		search = "",
		featured,
		published = true,
	} = params;

	try {
		const offset = (page - 1) * pageSize;

		const conditions = [];

		if (published !== undefined) {
			conditions.push(eq(collectionItem.published, published));
		}

		if (type) {
			conditions.push(eq(collectionItem.type, type));
		}

		if (featured !== undefined) {
			conditions.push(eq(collectionItem.featured, featured));
		}

		if (tags.length > 0) {
			conditions.push(
				sql`${collectionItem.tags} && ${sql.raw(`ARRAY[${tags.map((t) => `'${t}'`).join(",")}]::text[]`)}`,
			);
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
		console.error("Failed to fetch collection items:", error);
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

export async function getAllCollectionTags(): Promise<string[]> {
	try {
		const result = await db
			.selectDistinct({
				tag: sql<string>`unnest(${collectionItem.tags})`,
			})
			.from(collectionItem)
			.where(eq(collectionItem.published, true));

		return result.map((r) => r.tag).sort();
	} catch (error) {
		console.error("Failed to fetch collection tags:", error);
		return [];
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

export async function getFeaturedCollectionItems(
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
			.limit(limit);
	} catch (error) {
		console.error("Failed to fetch featured collection items:", error);
		return [];
	}
}
