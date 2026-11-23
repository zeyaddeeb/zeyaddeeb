import { proofNameSchema } from "@/features/gates/proof-name";
import { GATES_SERVICE_URL } from "@/features/gates/server/service";

export const dynamic = "force-dynamic";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ name: string }> },
) {
	const parsed = proofNameSchema.safeParse((await params).name);

	if (!parsed.success) return new Response(null, { status: 404 });

	let upstream: Response;

	try {
		upstream = await fetch(`${GATES_SERVICE_URL}/proofs/${parsed.data}`, {
			cache: "no-store",
			signal: request.signal,
		});
	} catch {
		return new Response(null, { status: 503 });
	}

	if (!upstream.ok || !upstream.body) {
		return new Response(null, { status: upstream.status });
	}

	return new Response(upstream.body, {
		headers: {
			"content-type": "text/plain; charset=utf-8",
			"content-disposition": `attachment; filename="${parsed.data}"`,
			"cache-control": "no-store",
		},
	});
}
