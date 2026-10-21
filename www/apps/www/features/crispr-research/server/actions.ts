"use server";

import type {
	About,
	Gate,
	Overview,
} from "@/features/crispr-research/protocol";
import { CRISPR_RESEARCH_SERVICE_URL } from "./service";

export type Loaded<T> = { ok: true; value: T } | { ok: false; missing?: true };

async function get<T>(path: string, ms = 8000): Promise<Loaded<T>> {
	try {
		const response = await fetch(`${CRISPR_RESEARCH_SERVICE_URL}${path}`, {
			cache: "no-store",
			signal: AbortSignal.timeout(ms),
		});

		if (response.status === 404) return { ok: false, missing: true };

		if (!response.ok) return { ok: false };

		return { ok: true, value: (await response.json()) as T };
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

export async function loadGate(): Promise<Loaded<Gate>> {
	return get<Gate>("/reach/gate", 5000);
}
