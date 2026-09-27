declare const process: { env: { NEXT_PUBLIC_CRDT_URL?: string } };

const LOCAL_CRDT = "ws://localhost:3002";

function toWsBase(raw: string) {
	return raw
		.trim()
		.replace(/\/+$/, "")
		.replace(/^http:/, "ws:")
		.replace(/^https:/, "wss:");
}

export function crdtWsBase(explicitBase?: string): string {
	if (explicitBase?.trim()) return toWsBase(explicitBase);
	if (typeof window === "undefined") return LOCAL_CRDT;

	const envBase = process.env.NEXT_PUBLIC_CRDT_URL;
	if (envBase?.trim()) return toWsBase(envBase);

	const { protocol, hostname } = window.location;
	const isLocal =
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname.endsWith(".local");
	if (isLocal) return LOCAL_CRDT;

	const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
	return `${wsProtocol}//crdt.${hostname.replace(/^www\./, "")}`;
}
