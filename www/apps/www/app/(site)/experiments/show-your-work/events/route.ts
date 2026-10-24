import { cookies } from "next/headers";
import { runCookie, runIdSchema } from "@/features/cups/server/input";
import {
	CUPS_SERVICE_URL,
	runCredential,
} from "@/features/cups/server/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const run = new URL(request.url).searchParams.get("run") ?? "";

	if (!runIdSchema.safeParse(run).success)
		return new Response(null, { status: 400 });

	const credential = runCredential((await cookies()).get(runCookie)?.value);

	if (credential?.id !== run) return new Response(null, { status: 403 });

	let upstream: Response;

	try {
		upstream = await fetch(`${CUPS_SERVICE_URL}/cups/runs/${run}/events`, {
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

	if (!upstream.ok || !upstream.body)
		return new Response(null, { status: upstream.status });

	return new Response(upstream.body, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache, no-transform",
			"x-accel-buffering": "no",
		},
	});
}
