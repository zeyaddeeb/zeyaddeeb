"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	EMPTY,
	type Envelope,
	keyOf,
	type Recording,
	reduce,
	type Thought,
} from "./reasoner";
import { actOnReasoner, askReasoner, leaveReasoner } from "./server/actions";
import type { Action } from "./server/input";

export type Source = "none" | "asking" | "live" | "recorded";
export type Trouble = "off" | "busy" | "down" | null;

let recordings: Promise<Recording[]> | null = null;

function loadRecordings() {
	recordings ??= fetch("/show-your-work/recorded.json")
		.then((r) => (r.ok ? r.json() : []))
		.catch(() => []);

	return recordings;
}

export function useReasoner(start: number, swaps: readonly number[]) {
	const [thought, setThought] = useState<Thought>(EMPTY);
	const [source, setSource] = useState<Source>("none");
	const [trouble, setTrouble] = useState<Trouble>(null);
	const [asked, setAsked] = useState<string | null>(null);
	const [recorded, setRecorded] = useState<Recording[]>([]);
	const live = useRef<{ id: string; events: EventSource } | null>(null);
	const timers = useRef<number[]>([]);
	const key = keyOf(start, swaps);

	useEffect(() => {
		let on = true;

		loadRecordings().then((r) => {
			if (on) setRecorded(r);
		});

		return () => {
			on = false;
		};
	}, []);

	const halt = useCallback(() => {
		for (const t of timers.current) window.clearTimeout(t);
		timers.current = [];
		live.current?.events.close();
		live.current = null;
	}, []);

	const leave = useCallback(() => {
		if (live.current) leaveReasoner().catch(() => undefined);

		halt();
	}, [halt]);

	useEffect(() => leave, [leave]);

	const reset = useCallback(() => {
		leave();
		setThought(EMPTY);
		setSource("none");
		setAsked(null);
	}, [leave]);

	useEffect(() => {
		if (asked !== null && asked !== key) reset();
	}, [key, asked, reset]);

	const replay = useCallback(
		(recording: Recording) => {
			halt();
			setThought(EMPTY);
			setSource("recorded");
			setAsked(keyOf(recording.start, recording.swaps));

			for (const [ms, envelope] of recording.events) {
				timers.current.push(
					window.setTimeout(() => setThought((t) => reduce(t, envelope)), ms),
				);
			}
		},
		[halt],
	);

	const ask = useCallback(async () => {
		halt();
		setThought(EMPTY);
		setTrouble(null);
		setSource("asking");
		setAsked(key);

		const answer = await askReasoner({ start, swaps: [...swaps] });

		if (!answer.ok) {
			const match = recorded.find((r) => keyOf(r.start, r.swaps) === key);

			setTrouble(answer.reason);

			if (match) replay(match);
			else setSource("none");

			return;
		}

		const events = new EventSource(
			`/experiments/show-your-work/events?run=${answer.id}`,
		);

		events.onmessage = (message) => {
			try {
				const envelope = JSON.parse(message.data) as Envelope;

				setThought((t) => reduce(t, envelope));
			} catch {}
		};

		events.onerror = () => {
			if (events.readyState === EventSource.CLOSED) setTrouble("down");
		};

		live.current = { id: answer.id, events };
		setSource("live");
	}, [halt, key, start, swaps, recorded, replay]);

	const act = useCallback(
		async (action: Action) => {
			if (source === "recorded" && action.action === "answer") {
				for (const t of timers.current) window.clearTimeout(t);
				timers.current = [];
				setThought((t) => ({
					...t,
					meter: { ...t.meter, phase: "answered" },
				}));

				return true;
			}

			const run = live.current;

			if (source !== "live" || !run) return false;

			return actOnReasoner(run.id, action);
		},
		[source],
	);

	return {
		thought: asked === key ? thought : EMPTY,
		source: asked === key ? source : "none",
		trouble,
		recorded,
		ask,
		act,
		replay,
		reset,
	};
}
