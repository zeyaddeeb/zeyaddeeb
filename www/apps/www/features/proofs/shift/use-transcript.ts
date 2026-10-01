"use client";

import { useEffect, useRef, useState } from "react";
import { loadEpisode } from "@/features/proofs/server/shift";
import type { Episode, Transcript } from "./protocol";
import type { TurnView } from "./reduce";

export type Opened =
	| { state: "loading"; number: number }
	| { state: "missing"; number: number }
	| { state: "ready"; number: number; episode: Episode; turns: TurnView[] };

export function views(transcript: Transcript): TurnView[] {
	return transcript.turns.map((turn) => ({
		index: turn.index,
		think: turn.thought,
		say: turn.said,
		calls: turn.calls.map((call) => ({
			id: call.id,
			tool: call.tool,
			args: call.args,
			outcome: {
				ok: call.ok,
				summary: call.summary,
				verdict: call.verdict,
				data: call.data,
			},
		})),
	}));
}

export function useTranscript(number: number | null): Opened | null {
	const cache = useRef(new Map<number, Opened>());
	const [opened, setOpened] = useState<Opened | null>(null);

	useEffect(() => {
		if (number === null) {
			setOpened(null);

			return;
		}

		const known = cache.current.get(number);

		if (known) {
			setOpened(known);

			return;
		}

		let current = true;

		setOpened({ state: "loading", number });

		loadEpisode(number).then((loaded) => {
			const next: Opened = loaded.ok
				? {
						state: "ready",
						number,
						episode: loaded.value.episode,
						turns: views(loaded.value),
					}
				: { state: "missing", number };

			if (loaded.ok) cache.current.set(number, next);

			if (current) setOpened(next);
		});

		return () => {
			current = false;
		};
	}, [number]);

	return opened;
}
