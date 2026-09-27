import { sessionIdSchema } from "./input";

export function sessionCredential(value: string | undefined) {
	const parts = value?.split(".");
	if (parts?.length !== 2) return null;
	const [id, token] = parts;
	if (
		!sessionIdSchema.safeParse(id).success ||
		!sessionIdSchema.safeParse(token).success
	)
		return null;
	return { id, authorization: `Bearer ${token}` };
}
