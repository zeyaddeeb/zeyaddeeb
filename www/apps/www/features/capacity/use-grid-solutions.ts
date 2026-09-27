"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { solveGrid } from "@/features/capacity/server/actions";
import type { GridGame, GridSolutions } from "./grid-game";
import { choiceOf, editsOf } from "./grid-game";
import type { GridChoice, GridEdits, GridLevel, GridSolved } from "./protocol";

const LIVE_DEBOUNCE_MS = 140;

function useLatest() {
	const ticket = useRef(0);
	return useCallback(() => {
		const mine = ++ticket.current;
		return () => mine === ticket.current;
	}, []);
}

export function useGridSolutions(
	level: GridLevel,
	game: GridGame,
	preview: GridChoice | undefined,
) {
	const [best, setBest] = useState<GridSolved | null>(null);
	const [today, setToday] = useState<GridSolved | null>(null);
	const [yours, setYours] = useState<GridSolved | null>(null);
	const [shown, setShown] = useState<GridSolved | null>(null);
	const [live, setLive] = useState<GridSolved | null>(null);
	const [pending, setPending] = useState(0);
	const [failed, setFailed] = useState(false);
	const bestTicket = useLatest();
	const yoursTicket = useLatest();
	const previewTicket = useLatest();
	const liveTicket = useLatest();

	const request = useCallback(
		async (choice: GridChoice | null, edits: GridEdits = {}) => {
			setPending((n) => n + 1);
			const result = await solveGrid(level.id, choice, edits);
			setPending((n) => n - 1);
			setFailed(!result.ok);
			return result.ok ? result.solved : null;
		},
		[level.id],
	);

	useEffect(() => {
		const current = bestTicket();
		setBest(null);
		setToday(null);
		Promise.all([request(null), request({})]).then(([solved, now]) => {
			if (!current()) return;
			setBest(solved);
			setToday(now);
		});
	}, [request, bestTicket]);

	const choice = JSON.stringify(choiceOf(game, level));
	useEffect(() => {
		const current = yoursTicket();
		request(JSON.parse(choice)).then((solved) => {
			if (current() && solved) setYours(solved);
		});
	}, [choice, request, yoursTicket]);

	const previewKey = preview ? JSON.stringify(preview) : null;
	useEffect(() => {
		if (previewKey === null) return;
		const current = previewTicket();
		request(JSON.parse(previewKey)).then((solved) => {
			if (current() && solved) setShown(solved);
		});
	}, [previewKey, request, previewTicket]);

	const edits = JSON.stringify(editsOf(game));
	useEffect(() => {
		if (game.phase !== "play") {
			setLive(null);
			return;
		}
		const current = liveTicket();
		const timer = setTimeout(() => {
			request(null, JSON.parse(edits)).then((solved) => {
				if (current() && solved) setLive(solved);
			});
		}, LIVE_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [game.phase, edits, request, liveTicket]);

	const solutions: GridSolutions = {
		best,
		yours,
		preview: previewKey === null ? null : shown,
		today,
		live: live ?? (game.phase === "play" ? best : null),
	};
	return { solutions, pending: pending > 0, failed };
}
