import { cookies } from "next/headers";
import { sessionCookie, sessionIdSchema } from "../input";
import { sessionCredential } from "../session-auth";

const service = process.env.DEEPSEEK_BACKEND_URL ?? "http://127.0.0.1:3004";

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
		upstream = await fetch(`${service}/sessions/${session}/events`, {
			cache: "no-store",
			signal: request.signal,
			headers: {
				accept: "text/event-stream",
				authorization: credential.authorization,
			},
		});
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
