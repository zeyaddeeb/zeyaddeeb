"use client";

import { useEffect, useReducer, useState } from "react";
import { loadShift } from "@/features/proofs/server/shift";
import type { About, Envelope, Front, Overview, Strip } from "./protocol";
import { initial, type Live, reduce } from "./reduce";

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
					? { ...shift.live, lemmas: action.overview.lemmas }
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

		const disconnect = () => {
			source?.close();
			source = null;
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
				dispatch({
					kind: "connection",
					connection:
						opened.readyState === EventSource.CLOSED ? "off" : "reconnecting",
				});
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
					dispatch({ kind: "loaded", overview: loaded.value });
					if (loaded.value.about.mode === "off") {
						disconnect();
						dispatch({ kind: "connection", connection: "closed" });
					}
				} else {
					disconnect();
					dispatch({
						kind: "connection",
						connection: loaded.missing ? "closed" : "off",
					});
				}
			});
		};

		const visibility = () => {
			if (document.hidden) {
				if (!source) return;
				disconnect();
				dispatch({ kind: "connection", connection: "paused" });
			} else if (!source) {
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
