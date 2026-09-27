import { cookies } from "next/headers";
import { DEEPSEEK_SERVICE_URL } from "@/features/deepseek/server/config";
import {
	sessionCookie,
	sessionIdSchema,
} from "@/features/deepseek/server/input";
import { sessionCredential } from "@/features/deepseek/server/session-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const session = new URL(request.url).searchParams.get("session") ?? "";
	if (!sessionIdSchema.safeParse(session).success)
		return new Response(null, { status: 400 });
	const credential = sessionCredential(
		(await cookies()).get(sessionCookie)?.value,
	);
	if (credential?.id !== session) return new Response(null, { status: 403 });
	let upstream: Response;
	try {
		upstream = await fetch(
			`${DEEPSEEK_SERVICE_URL}/sessions/${session}/events`,
			{
				cache: "no-store",
				signal: request.signal,
				headers: {
					accept: "text/event-stream",
					authorization: credential.authorization,
				},
			},
		);
	} catch {
		return new Response(null, { status: 502 });
	}
	if (!upstream.ok || !upstream.body) {
		return new Response(null, { status: upstream.status });
	}
	return new Response(upstream.body, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache, no-transform",
			"x-accel-buffering": "no",
		},
	});
}
