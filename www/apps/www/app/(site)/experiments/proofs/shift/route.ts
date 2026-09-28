import { PROOFS_SERVICE_URL } from "@/features/proofs/server/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	let upstream: Response;
	try {
		upstream = await fetch(`${PROOFS_SERVICE_URL}/agent/events`, {
			cache: "no-store",
			signal: request.signal,
			headers: { accept: "text/event-stream" },
		});
	} catch {
		return new Response(null, { status: 503 });
	}
	if (upstream.status === 404) {
		return new Response(null, { status: 204 });
	}
	if (!upstream.ok || !upstream.body) {
		return new Response(null, { status: upstream.status });
	}
	return new Response(settled(upstream.body), {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache, no-transform",
			"x-accel-buffering": "no",
		},
	});
}

function settled(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	const reader = body.getReader();
	let done = false;
	const end = (controller: ReadableStreamDefaultController<Uint8Array>) => {
		if (done) return;
		done = true;
		try {
			controller.close();
		} catch {}
	};
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const read = await reader.read();
				if (read.done) end(controller);
				else if (!done) controller.enqueue(read.value);
			} catch {
				end(controller);
			}
		},
		cancel(reason) {
			done = true;
			return reader.cancel(reason).catch(() => {});
		},
	});
}
