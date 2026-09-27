"use client";

import { crdtWsBase } from "@zeyaddeeb/ui/crdt";
import { useEffect } from "react";

export function SitePresence() {
	useEffect(() => {
		const base = crdtWsBase();
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
