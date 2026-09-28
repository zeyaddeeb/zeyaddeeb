"use server";

import { z } from "zod";
import type {
	About,
	Episode,
	Overview,
	Transcript,
} from "@/features/proofs/shift/protocol";
import { PROOFS_SERVICE_URL } from "./service";

const episodeSchema = z.number().int().min(1).max(1_000_000_000);

export type Loaded<T> = { ok: true; value: T } | { ok: false; missing?: true };

async function get<T>(path: string): Promise<Loaded<T>> {
	try {
		const response = await fetch(`${PROOFS_SERVICE_URL}${path}`, {
			cache: "no-store",
			signal: AbortSignal.timeout(8000),
		});
		if (response.status === 404) return { ok: false, missing: true };
		if (!response.ok) return { ok: false };
		return { ok: true, value: await response.json() };
	} catch {
		return { ok: false };
	}
}

export async function loadMode(): Promise<Loaded<Pick<About, "mode">>> {
	return get<Pick<About, "mode">>("/agent/mode");
}

export async function loadShift(): Promise<Loaded<Overview>> {
	return get<Overview>("/agent");
}

export async function loadEpisode(number: number): Promise<Loaded<Transcript>> {
	const parsed = episodeSchema.safeParse(number);
	if (!parsed.success) return { ok: false };
	return get<Transcript>(`/agent/episodes/${parsed.data}`);
}

export async function loadEpisodes(before: number): Promise<Loaded<Episode[]>> {
	const parsed = episodeSchema.safeParse(before);
	if (!parsed.success) return { ok: false };
	return get<Episode[]>(`/agent/episodes?before=${parsed.data}`);
}

const querySchema = z.string().trim().min(1).max(100);

export async function searchEpisodes(
	query: string,
): Promise<Loaded<Episode[]>> {
	const parsed = querySchema.safeParse(query);
	if (!parsed.success) return { ok: false };
	return get<Episode[]>(`/agent/search?q=${encodeURIComponent(parsed.data)}`);
}
