"use server";

import { cookies } from "next/headers";
import type { Command, SessionView } from "@/features/deepseek/protocol";
import { commandSchema, sessionCookie, sessionIdSchema } from "./input";
import { sessionCredential } from "./session-auth";

const service = process.env.DEEPSEEK_BACKEND_URL ?? "http://127.0.0.1:3004";

export type Created =
	| { ok: true; session: SessionView }
	| { ok: false; reason: "full" | "down" };

export async function createSession(): Promise<Created> {
	try {
		const jar = await cookies();
		const existing = sessionCredential(jar.get(sessionCookie)?.value);
		if (existing) {
			const response = await fetch(`${service}/sessions/${existing.id}`, {
				cache: "no-store",
				signal: AbortSignal.timeout(5000),
				headers: { authorization: existing.authorization },
			});
			if (response.ok) return { ok: true, session: await response.json() };
			if (response.status !== 404 && response.status !== 403)
				return { ok: false, reason: "down" };
		}
		const response = await fetch(`${service}/sessions`, {
			method: "POST",
			cache: "no-store",
		});
		if (response.status === 503) return { ok: false, reason: "full" };
		if (!response.ok) return { ok: false, reason: "down" };
		const session: SessionView = await response.json();
		const token = response.headers.get("x-session-token");
		if (!sessionIdSchema.safeParse(token).success)
			return { ok: false, reason: "down" };
		jar.set(sessionCookie, `${session.id}.${token}`, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			path: "/experiments/deepseek",
			maxAge: 3600,
		});
		return { ok: true, session };
	} catch {
		return { ok: false, reason: "down" };
	}
}

export async function sendCommand(
	sessionId: string,
	command: Command & { commandId: string; generation: number },
): Promise<boolean> {
	const parsed = commandSchema.safeParse(command);
	if (!sessionIdSchema.safeParse(sessionId).success || !parsed.success)
		return false;
	const credential = sessionCredential(
		(await cookies()).get(sessionCookie)?.value,
	);
	if (credential?.id !== sessionId) return false;
	try {
		const response = await fetch(`${service}/sessions/${sessionId}/commands`, {
			method: "POST",
			cache: "no-store",
			headers: {
				"content-type": "application/json",
				authorization: credential.authorization,
			},
			body: JSON.stringify(parsed.data),
		});
		return response.ok;
	} catch {
		return false;
	}
}
