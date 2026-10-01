"use client";

import { useEffect, useReducer, useState } from "react";
import { loadShift } from "@/features/proofs/server/shift";
import type { About, Envelope, Front, Overview, Strip } from "./protocol";
import { initial, type Live, lineage, reduce } from "./reduce";

export type Connection =
	| "waking"
	| "live"
	| "reconnecting"
	| "paused"
	| "closed"
	| "off";

interface Shift {
	live: Live | null;
	about: About | null;
	strip: Strip | null;
	fronts: Front[];
	pending: Envelope[];
	syncing: boolean;
	connection: Connection;
}

type Action =
	| { kind: "syncing" }
	| { kind: "loaded"; overview: Overview }
	| { kind: "refreshed"; overview: Overview }
	| { kind: "event"; envelope: Envelope }
	| { kind: "connection"; connection: Connection };

const RETRY_FIRST_MS = 1_000;
const RETRY_MAX_MS = 30_000;
const GIVE_UP_AFTER = 8;

const start: Shift = {
	live: null,
	about: null,
	strip: null,
	fronts: [],
	pending: [],
	syncing: true,
	connection: "waking",
};

function step(shift: Shift, action: Action): Shift {
	switch (action.kind) {
		case "syncing":
			return { ...shift, syncing: true, pending: [] };
		case "loaded":
			return {
				...shift,
				live: shift.pending.reduce(reduce, initial(action.overview)),
				about: action.overview.about,
				strip: action.overview.strip,
				fronts: action.overview.fronts,
				pending: [],
				syncing: false,
			};
		case "refreshed":
			return {
				...shift,
				strip: action.overview.strip,
				live: shift.live
					? {
							...shift.live,
							lemmas: action.overview.lemmas,
							tree: action.overview.tree ?? shift.live.tree,
							rules: { ...lineage(action.overview), ...shift.live.rules },
						}
					: shift.live,
			};
		case "event":
			return {
				...shift,
				live: shift.live ? reduce(shift.live, action.envelope) : null,
				pending: shift.syncing
					? [...shift.pending, action.envelope]
					: shift.pending,
			};
		case "connection":
			return { ...shift, connection: action.connection };
	}
}

export function useShift() {
	const [shift, dispatch] = useReducer(step, start);

	useEffect(() => {
		let closed = false;
		let source: EventSource | null = null;
		let round = 0;
		let failures = 0;
		let retry: ReturnType<typeof setTimeout> | undefined;

		const disconnect = () => {
			clearTimeout(retry);
			source?.close();
			source = null;
		};

		const later = () => {
			disconnect();
			failures += 1;

			dispatch({
				kind: "connection",
				connection: failures > GIVE_UP_AFTER ? "off" : "reconnecting",
			});

			retry = setTimeout(
				connect,
				Math.min(RETRY_FIRST_MS * 2 ** (failures - 1), RETRY_MAX_MS),
			);
		};

		const connect = () => {
			disconnect();

			const current = ++round;
			const opened = new EventSource("/experiments/proofs/shift");

			source = opened;
			dispatch({ kind: "syncing" });
			opened.onopen = () =>
				dispatch({ kind: "connection", connection: "live" });

			opened.onerror = () => {
				if (closed || source !== opened) return;

				later();
			};

			opened.onmessage = (message) => {
				const envelope = JSON.parse(message.data) as Envelope;

				dispatch({ kind: "event", envelope });

				if (envelope.type === "concluded") {
					loadShift().then((loaded) => {
						if (!closed && loaded.ok)
							dispatch({ kind: "refreshed", overview: loaded.value });
					});
				}
			};

			loadShift().then((loaded) => {
				if (closed || current !== round) return;

				if (loaded.ok) {
					failures = 0;
					dispatch({ kind: "loaded", overview: loaded.value });

					if (loaded.value.about.mode === "off") {
						disconnect();
						dispatch({ kind: "connection", connection: "closed" });
					}
				} else if (loaded.missing) {
					disconnect();
					dispatch({ kind: "connection", connection: "closed" });
				} else {
					later();
				}
			});
		};

		const visibility = () => {
			if (document.hidden) {
				if (!source && retry === undefined) return;

				disconnect();
				retry = undefined;
				dispatch({ kind: "connection", connection: "paused" });
			} else if (!source) {
				failures = 0;
				connect();
			}
		};

		connect();
		document.addEventListener("visibilitychange", visibility);

		return () => {
			closed = true;
			disconnect();
			document.removeEventListener("visibilitychange", visibility);
		};
	}, []);

	return shift;
}

export function useNow(interval = 1000): number {
	const [now, setNow] = useState(0);

	useEffect(() => {
		setNow(Date.now());

		const timer = window.setInterval(() => setNow(Date.now()), interval);

		return () => window.clearInterval(timer);
	}, [interval]);

	return now;
}
