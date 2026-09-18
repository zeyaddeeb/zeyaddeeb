import { z } from "zod";

export const pagination = {
	page: z.number().int().min(1).max(10000).default(1),
	pageSize: z.number().int().min(1).max(100),
	search: z.string().max(256).optional(),
};

export const resultLimit = z.number().int().min(1).max(100);
