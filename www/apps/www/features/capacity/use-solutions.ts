"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { solveLevel } from "@/features/capacity/server/actions";
import type { Game, Solutions } from "./game";
import type { Edits, Level, Solved } from "./protocol";

const LIVE_DEBOUNCE_MS = 140;

function useLatest() {
	const ticket = useRef(0);
	return useCallback(() => {
		const mine = ++ticket.current;
		return () => mine === ticket.current;
	}, []);
}

export function useSolutions(level: Level, game: Game) {
	const [best, setBest] = useState<Solved | null>(null);
	const [built, setBuilt] = useState<Solved | null>(null);
	const [live, setLive] = useState<Solved | null>(null);
	const [pending, setPending] = useState(0);
	const [failed, setFailed] = useState(false);
	const bestTicket = useLatest();
	const builtTicket = useLatest();
	const liveTicket = useLatest();

	const request = useCallback(
		async (edits: Edits, optimize = false) => {
			setPending((n) => n + 1);
			const result = await solveLevel(level.id, edits, optimize);
			setPending((n) => n - 1);
			setFailed(!result.ok);
			return result.ok ? result.solved : null;
		},
		[level.id],
	);

	useEffect(() => {
		const current = bestTicket();
		setBest(null);
		setBuilt(null);
		setLive(null);
		request({}, !!level.build).then((solved) => {
			if (current()) setBest(solved);
		});
	}, [level, request, bestTicket]);

	useEffect(() => {
		if (!level.build) return;
		const current = builtTicket();
		request({ build: game.blocks }).then((solved) => {
			if (current()) setBuilt(solved);
		});
	}, [level.build, game.blocks, request, builtTicket]);

	useEffect(() => {
		if (game.phase !== "play") {
			setLive(null);
			return;
		}
		const current = liveTicket();
		const timer = setTimeout(() => {
			request(game.play, !!level.build).then((solved) => {
				if (current() && solved) setLive(solved);
			});
		}, LIVE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [game.phase, game.play, level.build, request, liveTicket]);

	const solutions: Solutions = {
		best,
		built,
		live: live ?? (game.phase === "play" ? best : null),
	};
	return { solutions, pending: pending > 0, failed };
}
