import { z } from "zod";
import { MOST } from "../deck";
import { DEALS } from "../protocol";
import { siteIds } from "../sites";

const count = z.number().int().min(-MOST).max(MOST);

export const askSchema = z.strictObject({
	deal: z.enum(DEALS),
	deck: z.tuple([count, count, count, count, count, count, count, count]),
	sites: z.tuple([z.enum(siteIds), z.enum(siteIds)]).optional(),
});

export type Ask = z.infer<typeof askSchema>;
