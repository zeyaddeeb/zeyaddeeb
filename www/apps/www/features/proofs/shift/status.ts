import { clock, label } from "./format";
import type { Live } from "./reduce";

const TROUBLE_MS = 90_000;

export function activity(live: Live, now: number): string {
	if (live.phase?.phase === "rest") {
		const left = (live.phase.seconds ?? 0) - (now - live.phase.at) / 1000;
		const back = left > 0 ? ` Back in ${clock(left)}.` : "";

		return live.phase.reason
			? `Resting: ${live.phase.reason}.${back}`
			: `Resting between episodes.${back}`;
	}

	if (live.trouble && now - live.trouble.at < TROUBLE_MS)
		return live.trouble.message;

	const last = live.turns.at(-1);
	const running = last?.calls.find((c) => !c.outcome);

	if (running) return `${label(running.tool)}…`;

	if (live.mode === "sleep")
		return last
			? "Sleeping: keeping what matters."
			: "Falling asleep to consolidate memory.";

	if (live.mode === "revise")
		return last ? "Choosing one change to test." : "Reading its trials.";

	if (live.mode === "idle") return "Waiting for the next episode.";

	if (!last) return "Reading its notes.";

	if (last.calls.length) return "Reading the result.";

	return last.say ? "Writing…" : "Thinking…";
}

export function plan(
	live: Live,
): { objective: string; prediction: string } | null {
	for (const turn of live.turns) {
		const call = turn.calls.find((c) => c.tool === "plan" && c.outcome?.ok);

		if (call)
			return {
				objective: String(call.args.objective ?? ""),
				prediction: String(call.args.prediction ?? ""),
			};
	}

	return null;
}
