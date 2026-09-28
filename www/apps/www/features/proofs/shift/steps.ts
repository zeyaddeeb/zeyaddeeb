import type { CallView, Outcome, TurnView } from "./reduce";

export type StepStatus =
	| "running"
	| "proved"
	| "routine"
	| "held"
	| "known"
	| "broke"
	| "refused"
	| "done";

export interface Step {
	id: string;
	turn: number;
	tool: string;
	args: Record<string, unknown>;
	outcome: Outcome | null;
	status: StepStatus;
}

function status(call: CallView): StepStatus {
	const { outcome } = call;
	if (!outcome) return "running";
	if (!outcome.ok) return "refused";
	if (call.tool === "formalize")
		return (outcome.data as { routine?: boolean } | null)?.routine
			? "routine"
			: "proved";
	if (outcome.verdict?.known && outcome.verdict.held) return "known";
	if (outcome.verdict) return outcome.verdict.held ? "held" : "broke";
	return "done";
}

export function steps(turns: TurnView[]): Step[] {
	return turns.flatMap((turn) =>
		turn.calls.map((call) => ({
			id: call.id,
			turn: turn.index,
			tool: call.tool,
			args: call.args,
			outcome: call.outcome,
			status: status(call),
		})),
	);
}

export function thinking(turns: TurnView[]): TurnView | null {
	const last = turns.at(-1);
	return last && last.calls.length === 0 ? last : null;
}
