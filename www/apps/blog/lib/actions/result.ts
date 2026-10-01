import type { z } from "zod";

export type WriteResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };

export function ok<T>(data: T): WriteResult<T> {
	return { success: true, data };
}

export function fail(error: string): { success: false; error: string } {
	return { success: false, error };
}

export function firstIssue(error: z.ZodError): string {
	return error.issues[0]?.message ?? "Invalid input";
}

const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
	let current: unknown = error;

	while (current && typeof current === "object") {
		if ("code" in current && current.code === UNIQUE_VIOLATION) return true;

		current = "cause" in current ? current.cause : undefined;
	}

	return false;
}
