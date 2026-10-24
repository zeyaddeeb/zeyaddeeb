"use server";

import { cookies } from "next/headers";
import {
	type Action,
	type Ask,
	actionSchema,
	askSchema,
	runCookie,
} from "./input";
import { CUPS_SERVICE_URL, runCredential } from "./service";

export type Asked =
	| { ok: true; id: string }
	| { ok: false; reason: "off" | "busy" | "down" };

async function drop(value: string | undefined) {
	const old = runCredential(value);

	if (!old) return;

	await fetch(`${CUPS_SERVICE_URL}/cups/runs/${old.id}`, {
		method: "DELETE",
		cache: "no-store",
		signal: AbortSignal.timeout(3000),
		headers: { authorization: old.authorization },
	}).catch(() => undefined);
}

export async function askReasoner(ask: Ask): Promise<Asked> {
	const parsed = askSchema.safeParse(ask);

	if (!parsed.success) return { ok: false, reason: "down" };

	try {
		const jar = await cookies();

		await drop(jar.get(runCookie)?.value);

		const response = await fetch(`${CUPS_SERVICE_URL}/cups/runs`, {
			method: "POST",
			cache: "no-store",
			signal: AbortSignal.timeout(5000),
			headers: { "content-type": "application/json" },
			body: JSON.stringify(parsed.data),
		});

		if (response.status === 503) {
			const body = (await response.json().catch(() => ({}))) as {
				reason?: string;
			};

			return { ok: false, reason: body.reason === "busy" ? "busy" : "off" };
		}

		if (!response.ok) return { ok: false, reason: "down" };

		const { id } = (await response.json()) as { id: string };
		const token = response.headers.get("x-run-token") ?? "";

		if (!runCredential(`${id}.${token}`)) return { ok: false, reason: "down" };

		jar.set(runCookie, `${id}.${token}`, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			path: "/experiments/show-your-work",
			maxAge: 1800,
		});

		return { ok: true, id };
	} catch {
		return { ok: false, reason: "down" };
	}
}

export async function actOnReasoner(id: string, action: Action) {
	const parsed = actionSchema.safeParse(action);
	const credential = runCredential((await cookies()).get(runCookie)?.value);

	if (!parsed.success || credential?.id !== id) return false;

	try {
		const response = await fetch(
			`${CUPS_SERVICE_URL}/cups/runs/${id}/actions`,
			{
				method: "POST",
				cache: "no-store",
				signal: AbortSignal.timeout(5000),
				headers: {
					"content-type": "application/json",
					authorization: credential.authorization,
				},
				body: JSON.stringify(parsed.data),
			},
		);

		return response.ok;
	} catch {
		return false;
	}
}

export async function leaveReasoner() {
	const jar = await cookies();

	await drop(jar.get(runCookie)?.value);
	jar.delete({ name: runCookie, path: "/experiments/show-your-work" });
}
