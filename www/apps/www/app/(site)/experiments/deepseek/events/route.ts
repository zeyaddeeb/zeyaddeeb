const service = process.env.DEEPSEEK_BACKEND_URL ?? "http://127.0.0.1:3004";
const SESSION = /^[0-9a-f-]{36}$/;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const session = new URL(request.url).searchParams.get("session") ?? "";
	if (!SESSION.test(session)) return new Response(null, { status: 400 });
	let upstream: Response;
	try {
		upstream = await fetch(`${service}/sessions/${session}/events`, {
			cache: "no-store",
			signal: request.signal,
			headers: { accept: "text/event-stream" },
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
