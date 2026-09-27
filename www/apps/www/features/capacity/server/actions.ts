"use server";

import { z } from "zod";
import type { Edits, Solved, World } from "@/features/capacity/protocol";

const service = process.env.CAPACITY_BACKEND_URL ?? "http://127.0.0.1:3006";

const id = z.string().regex(/^[a-z]{2,16}$/);

const solveSchema = z.strictObject({
	level: id,
	edits: z.strictObject({
		offline: z.array(id).max(16).optional(),
		latency: z.number().min(10).max(300).optional(),
		demand: z.number().min(0.25).max(3).optional(),
		build: z.record(id, z.number().int().min(0).max(8)).optional(),
	}),
	optimizeBuild: z.boolean(),
});

export type Loaded = { ok: true; world: World } | { ok: false };

export async function loadWorld(): Promise<Loaded> {
	try {
		const response = await fetch(`${service}/world`, {
			cache: "no-store",
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) return { ok: false };
		return { ok: true, world: await response.json() };
	} catch {
		return { ok: false };
	}
}

export type SolveResult =
	| { ok: true; solved: Solved }
	| { ok: false; reason: "down" | "invalid" };

export async function solveLevel(
	level: string,
	edits: Edits,
	optimizeBuild = false,
): Promise<SolveResult> {
	const parsed = solveSchema.safeParse({ level, edits, optimizeBuild });
	if (!parsed.success) return { ok: false, reason: "invalid" };
	try {
		const response = await fetch(`${service}/solve`, {
			method: "POST",
			cache: "no-store",
			signal: AbortSignal.timeout(8000),
			headers: { "content-type": "application/json" },
			body: JSON.stringify(parsed.data),
		});
		if (response.status === 422) return { ok: false, reason: "invalid" };
		if (!response.ok) return { ok: false, reason: "down" };
		return { ok: true, solved: await response.json() };
	} catch {
		return { ok: false, reason: "down" };
	}
}
