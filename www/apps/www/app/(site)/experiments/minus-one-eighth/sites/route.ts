import { sitesReply } from "@/features/eighth/protocol";
import { BELL_SERVICE_URL } from "@/features/eighth/server/service";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		const upstream = await fetch(`${BELL_SERVICE_URL}/sites`, {
			cache: "no-store",
			signal: AbortSignal.timeout(4000),
		});
		const parsed = sitesReply.safeParse(await upstream.json());

		if (upstream.ok && parsed.success)
			return Response.json({ off: false, sites: parsed.data.sites });
	} catch {}

	return Response.json({ off: true, sites: [] });
}
