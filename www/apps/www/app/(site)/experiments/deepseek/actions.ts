"use server";

import type { Command, SessionView } from "@/features/deepseek/protocol";

const service = process.env.DEEPSEEK_BACKEND_URL ?? "http://127.0.0.1:3004";
const SESSION = /^[0-9a-f-]{36}$/;

export type Created =
	| { ok: true; session: SessionView }
	| { ok: false; reason: "full" | "down" };

export async function createSession(): Promise<Created> {
	try {
		const response = await fetch(`${service}/sessions`, {
			method: "POST",
			cache: "no-store",
		});
		if (response.status === 503) return { ok: false, reason: "full" };
		if (!response.ok) return { ok: false, reason: "down" };
		return { ok: true, session: await response.json() };
	} catch {
		return { ok: false, reason: "down" };
	}
}

export async function sendCommand(
	sessionId: string,
	command: Command & { commandId: string; generation: number },
): Promise<boolean> {
	if (!SESSION.test(sessionId)) return false;
	try {
		const response = await fetch(`${service}/sessions/${sessionId}/commands`, {
			method: "POST",
			cache: "no-store",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(command),
		});
		return response.ok;
	} catch {
		return false;
	}
}
