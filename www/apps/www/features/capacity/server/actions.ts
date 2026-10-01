"use server";

import { z } from "zod";
import type {
	Edits,
	GridChoice,
	GridEdits,
	GridSolved,
	GridWorld,
	PlanSolved,
	PlansWorld,
	Schedule,
	Solved,
	World,
} from "@/features/capacity/protocol";

const service = process.env.CAPACITY_BACKEND_URL ?? "http://127.0.0.1:3006";

const id = z.string().regex(/^[a-z]{2,16}$/);
const lineId = z.string().regex(/^[a-z]{2,16}-[a-z]{2,16}$/);

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

const gridSolveSchema = z.strictObject({
	level: id,
	placement: z.record(id, id).optional(),
	built: z.array(lineId).max(8).optional(),
	opened: z.array(lineId).max(16).optional(),
	edits: z.strictObject({
		tripped: z.array(lineId).max(16).optional(),
		demand: z.number().min(0.5).max(1.5).optional(),
	}),
	optimize: z.boolean(),
});

const projectId = z.string().regex(/^[a-z]{2,16}(-[a-z]{2,16}){0,2}$/);
const caseId = z.string().regex(/^[a-z0-9]{2,16}$/);

const planSolveSchema = z.strictObject({
	level: id,
	schedule: z
		.strictObject({
			starts: z
				.array(
					z.strictObject({
						project: projectId,
						period: z.number().int().min(0).max(8),
						count: z.number().int().min(1).max(8),
					}),
				)
				.max(16),
			rentals: z
				.array(
					z.strictObject({
						project: projectId,
						case: caseId,
						blocks: z.number().int().min(1).max(8),
					}),
				)
				.max(32),
			opened: z.array(z.strictObject({ line: lineId, case: caseId })).max(48),
		})
		.nullable(),
});

async function load<T>(path: string): Promise<T | null> {
	try {
		const response = await fetch(`${service}${path}`, {
			cache: "no-store",
			signal: AbortSignal.timeout(5000),
		});

		return response.ok ? await response.json() : null;
	} catch {
		return null;
	}
}

export type Loaded =
	| { ok: true; world: World; grid: GridWorld; plans: PlansWorld }
	| { ok: false };

export async function loadWorld(): Promise<Loaded> {
	const [world, grid, plans] = await Promise.all([
		load<World>("/world"),
		load<GridWorld>("/grid"),
		load<PlansWorld>("/plans"),
	]);

	return world && grid && plans
		? { ok: true, world, grid, plans }
		: { ok: false };
}

async function post<T>(
	path: string,
	body: unknown,
): Promise<{ ok: true; value: T } | { ok: false; reason: "down" | "invalid" }> {
	try {
		const response = await fetch(`${service}${path}`, {
			method: "POST",
			cache: "no-store",
			signal: AbortSignal.timeout(8000),
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});

		if (response.status === 422) return { ok: false, reason: "invalid" };

		if (!response.ok) return { ok: false, reason: "down" };

		return { ok: true, value: await response.json() };
	} catch {
		return { ok: false, reason: "down" };
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

	const result = await post<Solved>("/solve", parsed.data);

	return result.ok ? { ok: true, solved: result.value } : result;
}

export type GridSolveResult =
	| { ok: true; solved: GridSolved }
	| { ok: false; reason: "down" | "invalid" };

export async function solveGrid(
	level: string,
	choice: GridChoice | null,
	edits: GridEdits = {},
): Promise<GridSolveResult> {
	const parsed = gridSolveSchema.safeParse({
		level,
		...(choice ?? {}),
		edits,
		optimize: choice === null,
	});

	if (!parsed.success) return { ok: false, reason: "invalid" };

	const result = await post<GridSolved>("/grid/solve", parsed.data);

	return result.ok ? { ok: true, solved: result.value } : result;
}

export type PlanSolveResult =
	| { ok: true; solved: PlanSolved }
	| { ok: false; reason: "down" | "invalid" };

export async function solvePlan(
	level: string,
	schedule: Schedule | null,
): Promise<PlanSolveResult> {
	const parsed = planSolveSchema.safeParse({ level, schedule });

	if (!parsed.success) return { ok: false, reason: "invalid" };

	const result = await post<PlanSolved>("/plan/solve", parsed.data);

	return result.ok ? { ok: true, solved: result.value } : result;
}
