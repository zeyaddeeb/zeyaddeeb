"use server";

import type { Lab } from "@/features/gates/protocol";
import { GATES_SERVICE_URL } from "./service";

export type Loaded<T> = { ok: true; value: T } | { ok: false };

export async function loadLab(): Promise<Loaded<Lab>> {
	try {
		const response = await fetch(`${GATES_SERVICE_URL}/lab`, {
			cache: "no-store",
			signal: AbortSignal.timeout(8000),
		});

		if (!response.ok) return { ok: false };

		return { ok: true, value: await response.json() };
	} catch {
		return { ok: false };
	}
}
