import { z } from "zod";

export const sessionIdSchema = z.uuid();
export const sessionCookie = "deepseek-session";

const common = {
	commandId: z.uuid(),
	generation: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
};

const text = z
	.string()
	.max(4096)
	.refine((value) => new TextEncoder().encode(value).length <= 4096);

export const commandSchema = z.discriminatedUnion("type", [
	z.strictObject({
		...common,
		type: z.literal("start"),
		phase: z.enum(["pretrain", "sft", "rl", "distill"]),
		steps: z.number().int().min(1).max(2000).optional(),
	}),
	...["pause", "resume", "reset"].map((type) =>
		z.strictObject({ ...common, type: z.literal(type) }),
	),
	z.strictObject({
		...common,
		type: z.literal("cancel"),
		operationId: z.uuid().optional(),
	}),
	z.strictObject({
		...common,
		type: z.literal("focus"),
		position: z.number().int().min(0).max(47),
	}),
	...["ask", "show"].map((type) =>
		z.strictObject({
			...common,
			type: z.literal(type),
			code: text.min(1),
			question: text.min(1),
		}),
	),
]);
