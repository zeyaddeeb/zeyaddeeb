import { runIdSchema } from "./input";

export const CUPS_SERVICE_URL =
	process.env.DEEPSEEK_BACKEND_URL ?? "http://127.0.0.1:3004";

export function runCredential(value: string | undefined) {
	const parts = value?.split(".");

	if (parts?.length !== 2) return null;

	const [id, token] = parts;

	if (
		!runIdSchema.safeParse(id).success ||
		!runIdSchema.safeParse(token).success
	)
		return null;

	return { id, authorization: `Bearer ${token}` };
}
