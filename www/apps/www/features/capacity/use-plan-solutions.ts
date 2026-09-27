"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { solvePlan } from "@/features/capacity/server/actions";
import type { PlanGame, PlanSolutions } from "./plan-game";
import { scheduleOf } from "./plan-game";
import type { PlanLevel, PlanSolved, Schedule } from "./protocol";

function useLatest() {
	const ticket = useRef(0);
	return useCallback(() => {
		const mine = ++ticket.current;
		return () => mine === ticket.current;
	}, []);
}

export function usePlanSolutions(level: PlanLevel, game: PlanGame) {
	const [best, setBest] = useState<PlanSolved | null>(null);
	const [yours, setYours] = useState<PlanSolved | null>(null);
	const [pending, setPending] = useState(0);
	const [failed, setFailed] = useState(false);
	const bestTicket = useLatest();
	const yoursTicket = useLatest();

	const request = useCallback(
		async (schedule: Schedule | null) => {
			setPending((n) => n + 1);
			const result = await solvePlan(level.id, schedule);
			setPending((n) => n - 1);
			setFailed(!result.ok);
			return result.ok ? result.solved : null;
		},
		[level.id],
	);

	useEffect(() => {
		const current = bestTicket();
		setBest(null);
		request(null).then((solved) => {
			if (current()) setBest(solved);
		});
	}, [request, bestTicket]);

	const schedule = JSON.stringify(scheduleOf(game, level));
	useEffect(() => {
		const current = yoursTicket();
		request(JSON.parse(schedule)).then((solved) => {
			if (current() && solved) setYours(solved);
		});
	}, [schedule, request, yoursTicket]);

	const solutions: PlanSolutions = { best, yours };
	return { solutions, pending: pending > 0, failed };
}
