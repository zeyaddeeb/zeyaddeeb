import { total } from "@/features/eighth/deck";
import { askSchema } from "@/features/eighth/server/input";
import { BELL_SERVICE_URL } from "@/features/eighth/server/service";

export const dynamic = "force-dynamic";

const refuse = (status: number, reason: string) =>
	Response.json({ reason }, { status });

export async function POST(request: Request) {
	const parsed = askSchema.safeParse(await request.json().catch(() => null));

	if (!parsed.success) return refuse(400, "invalid");
	if (parsed.data.deal === "deck" && total(parsed.data.deck) <= 0)
		return refuse(400, "invalid");

	let upstream: Response;

	try {
		upstream = await fetch(`${BELL_SERVICE_URL}/runs`, {
			method: "POST",
			cache: "no-store",
			signal: request.signal,
			headers: { "content-type": "application/json" },
			body: JSON.stringify(parsed.data),
		});
	} catch {
		return refuse(503, "off");
	}

	if (upstream.status === 503) return refuse(503, "busy");
	if (!upstream.ok || !upstream.body) return refuse(502, "off");

	return new Response(upstream.body, {
		headers: {
			"content-type": "application/x-ndjson",
			"cache-control": "no-cache, no-transform",
			"x-accel-buffering": "no",
		},
	});
}
