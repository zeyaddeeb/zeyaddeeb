"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { Envelope, Overview } from "./protocol";
import { initial, type Live, reduce, refreshed } from "./reduce";
import { loadShift } from "./server/actions";

export type Connection =
	| "waking"
	| "live"
	| "reconnecting"
	| "paused"
	| "closed";

const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 30000;
const GIVE_UP_AFTER = 8;

type Action =
	| { kind: "syncing" }
	| { kind: "loaded"; overview: Overview }
	| { kind: "refreshed"; overview: Overview }
	| { kind: "event"; envelope: Envelope }
	| { kind: "connection"; connection: Connection };

interface Shift {
	live: Live | null;
	pending: Envelope[];
	syncing: boolean;
	connection: Connection;
}

const EMPTY: Shift = {
	live: null,
	pending: [],
	syncing: true,
	connection: "waking",
};

function step(shift: Shift, action: Action): Shift {
	switch (action.kind) {
		case "syncing":
			return { ...shift, syncing: true, pending: [] };
		case "loaded": {
			const base = initial(action.overview);

			return {
				...shift,
				syncing: false,
				pending: [],
				live: shift.pending.reduce(reduce, base),
			};
		}
		case "refreshed":
			return shift.live
				? { ...shift, live: refreshed(shift.live, action.overview) }
				: shift;
		case "event":
			if (shift.syncing || !shift.live) {
				return { ...shift, pending: [...shift.pending, action.envelope] };
			}

			return { ...shift, live: reduce(shift.live, action.envelope) };
		case "connection":
			return { ...shift, connection: action.connection };
		default:
			return shift;
	}
}

export function useResearch(path: string) {
	const [shift, dispatch] = useReducer(step, EMPTY);
	const [off, setOff] = useState(false);

	useEffect(() => {
		let source: EventSource | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let failures = 0;
		let round = 0;
		let closed = false;
		let reached = false;

		const disconnect = () => {
			source?.close();
			source = null;
		};

		const later = () => {
			disconnect();
			failures += 1;

			if (!reached) {
				setOff(true);
				dispatch({ kind: "connection", connection: "closed" });
				timer = setTimeout(connect, RETRY_MAX_MS);

				return;
			}

			if (failures > GIVE_UP_AFTER) {
				dispatch({ kind: "connection", connection: "closed" });

				return;
			}

			dispatch({ kind: "connection", connection: "reconnecting" });
			timer = setTimeout(
				connect,
				Math.min(RETRY_FIRST_MS * 2 ** (failures - 1), RETRY_MAX_MS),
			);
		};

		const connect = () => {
			disconnect();

			const current = ++round;
			const opened = new EventSource(path);

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
					reached = true;
					setOff(false);
					dispatch({ kind: "loaded", overview: loaded.value });

					if (loaded.value.about.mode === "off") {
						disconnect();
						setOff(true);
						dispatch({ kind: "connection", connection: "closed" });
					}
				} else if (loaded.missing) {
					disconnect();
					setOff(true);
					dispatch({ kind: "connection", connection: "closed" });
				} else {
					later();
				}
			});
		};

		const visibility = () => {
			if (document.visibilityState === "hidden") {
				disconnect();
				dispatch({ kind: "connection", connection: "paused" });
			} else if (!closed) {
				connect();
			}
		};

		connect();
		document.addEventListener("visibilitychange", visibility);

		return () => {
			closed = true;
			document.removeEventListener("visibilitychange", visibility);

			if (timer) clearTimeout(timer);

			disconnect();
		};
	}, [path]);

	return { ...shift, off };
}

export function useNow(interval = 1000) {
	const [now, setNow] = useState(0);
	const started = useRef(Date.now());

	useEffect(() => {
		const id = setInterval(
			() => setNow(Date.now() - started.current),
			interval,
		);

		return () => clearInterval(id);
	}, [interval]);

	return now;
}
