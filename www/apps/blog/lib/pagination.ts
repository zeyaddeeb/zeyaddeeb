export const POSTS_PAGE_SIZE = 10;
export const COLLECTION_PAGE_SIZE = 12;

export interface PaginatedResult<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
}

export function paginatedResult<T>(
	items: T[],
	total: number,
	page: number,
	pageSize: number,
): PaginatedResult<T> {
	const totalPages = Math.ceil(total / pageSize);

	return {
		items,
		total,
		page,
		pageSize,
		totalPages,
		hasNextPage: page < totalPages,
		hasPreviousPage: page > 1,
	};
}

export function emptyPage<T>(
	page: number,
	pageSize: number,
): PaginatedResult<T> {
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
