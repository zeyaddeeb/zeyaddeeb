import { z } from "zod";

export const runIdSchema = z.uuid();
export const runCookie = "show-your-work-run";

export const askSchema = z.strictObject({
	start: z.number().int().min(0).max(4),
	swaps: z.array(z.number().int().min(0).max(9)).min(1).max(60),
});

export const actionSchema = z.discriminatedUnion("action", [
	z.strictObject({ action: z.literal("answer") }),
	z.strictObject({ action: z.literal("wait") }),
	z.strictObject({
		action: z.literal("forge"),
		at: z.number().int().min(0).max(100_000),
		cup: z.number().int().min(1).max(5),
	}),
]);

export type Ask = z.infer<typeof askSchema>;
export type Action = z.infer<typeof actionSchema>;
