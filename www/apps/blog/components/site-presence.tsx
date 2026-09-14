"use client";

import { useEffect } from "react";

export function SitePresence() {
	useEffect(() => {
		const explicit = process.env.NEXT_PUBLIC_CRDT_URL?.trim();
		const { hostname, protocol } = window.location;
		const local =
			hostname === "localhost" ||
			hostname === "127.0.0.1" ||
			hostname.endsWith(".local");
		const base = (
			explicit ||
			(local
				? "ws://localhost:3002"
				: `${protocol === "https:" ? "wss:" : "ws:"}//crdt.${hostname.replace(/^www\./, "")}`)
		)
			.replace(/^http:/, "ws:")
			.replace(/^https:/, "wss:")
			.replace(/\/+$/, "");
		let stopped = false;
		let socket: WebSocket | null = null;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let attempt = 0;
		const connect = () => {
			if (stopped) return;
			socket = new WebSocket(`${base}/ws/home`);
			const ws = socket;
			ws.onopen = () => {
				if (stopped) {
					ws.close();
					return;
				}
				ws.send(JSON.stringify({ type: "join" }));
			};
			ws.onmessage = (event) => {
				try {
					if (JSON.parse(event.data).type === "init") attempt = 0;
				} catch {}
			};
			ws.onclose = () => {
				if (!stopped)
					timer = setTimeout(
						connect,
						Math.min(15000, 1000 * 2 ** Math.min(attempt++, 4)),
					);
			};
		};
		connect();
		return () => {
			stopped = true;
			clearTimeout(timer);
			socket?.close();
		};
	}, []);
	return null;
}
