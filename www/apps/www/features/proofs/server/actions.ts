"use server";

import { z } from "zod";
import type { Checked, LevelStart } from "@/features/proofs/protocol";

const service = process.env.PROOFS_BACKEND_URL ?? "http://127.0.0.1:3005";

const checkSchema = z.strictObject({
	level: z.string().regex(/^[a-z]{1,24}$/),
	steps: z.array(z.string().min(1).max(240)).max(24),
});

export type Loaded =
	| { ok: true; levels: LevelStart[] }
	| { ok: false; reason: "down" };

export async function loadLevels(): Promise<Loaded> {
	try {
		const response = await fetch(`${service}/levels`, {
			cache: "no-store",
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) return { ok: false, reason: "down" };
		return { ok: true, levels: await response.json() };
	} catch {
		return { ok: false, reason: "down" };
	}
}

export type CheckResult =
	| { ok: true; checked: Checked }
	| { ok: false; reason: "busy" | "down" | "invalid" };

export async function checkProof(
	level: string,
	steps: string[],
): Promise<CheckResult> {
	const parsed = checkSchema.safeParse({ level, steps });
	if (!parsed.success) return { ok: false, reason: "invalid" };
	try {
		const response = await fetch(`${service}/check`, {
			method: "POST",
			cache: "no-store",
			signal: AbortSignal.timeout(20000),
			headers: { "content-type": "application/json" },
			body: JSON.stringify(parsed.data),
		});
		if (response.status === 503) return { ok: false, reason: "busy" };
		if (!response.ok) return { ok: false, reason: "down" };
		return { ok: true, checked: await response.json() };
	} catch {
		return { ok: false, reason: "down" };
	}
}
