"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
	createSession,
	sendCommand,
} from "@/app/(site)/experiments/deepseek/actions";
import {
	type Command,
	type CurvePoint,
	type DistillView,
	type DreamView,
	type EvaluationPoint,
	type JournalEntry,
	type OperationView,
	type ProbeView,
	type RolloutView,
	type ServerEvent,
	type SessionView,
	type StepView,
	TERMINAL,
	type TokenEvent,
} from "./protocol";

export type Connection = "connecting" | "live" | "full" | "down";

export interface LabState {
	connection: Connection;
	session: SessionView | null;
	operation: OperationView | null;
	probe: ProbeView | null;
	curve: CurvePoint[];
	evaluations: EvaluationPoint[];
	dreams: DreamView[];
	step: StepView | null;
	rollout: RolloutView | null;
	rewards: number[];
	distill: DistillView | null;
	divergences: number[];
	spoken: TokenEvent[];
	journal: JournalEntry[];
	error: string | null;
	replaced: boolean;
}

const initial: LabState = {
	connection: "connecting",
	session: null,
	operation: null,
	probe: null,
	curve: [],
	evaluations: [],
	dreams: [],
	step: null,
	rollout: null,
	rewards: [],
	distill: null,
	divergences: [],
	spoken: [],
	journal: [],
	error: null,
	replaced: false,
};

type Action =
	| { kind: "event"; event: ServerEvent }
	| { kind: "connection"; connection: Connection; replaced?: boolean }
	| { kind: "error"; message: string | null }
	| { kind: "asking" };

const CURVE_LIMIT = 2400;

function reduce(state: LabState, action: Action): LabState {
	if (action.kind === "connection") {
		return {
			...state,
			connection: action.connection,
			replaced: action.replaced ?? state.replaced,
		};
	}
	if (action.kind === "error") return { ...state, error: action.message };
	if (action.kind === "asking") return { ...state, spoken: [], error: null };

	const event = action.event;
	if (event.type === "snapshot") {
		const session = event.session;
		return {
			...state,
			connection: "live",
			session,
			operation: session.operation,
			probe: session.probe,
			curve: session.curve,
			evaluations: session.evaluations,
			dreams: session.dreams,
			rollout: session.rollout,
			distill: session.distill,
			journal: session.journal,
			...(state.session && state.session.generation !== session.generation
				? { step: null, rewards: [], divergences: [], spoken: [], error: null }
				: {}),
		};
	}
	if (!state.session || event.generation !== state.session.generation) {
		return state;
	}
	switch (event.type) {
		case "lifecycle": {
			const last = state.journal.at(-1);
			const changed =
				last?.operationId !== event.operation.operationId ||
				last.state !== event.operation.state;
			return {
				...state,
				operation: event.operation,
				journal: changed
					? [
							...state.journal.slice(-47),
							{
								operationId: event.operation.operationId,
								atMs: Date.now(),
								state: event.operation.state,
								stage: event.operation.stage,
							},
						]
					: state.journal,
			};
		}
		case "step": {
			const first = event.step + 1 - event.losses.length;
			const points = event.losses.map((loss, i) => ({
				step: first + i,
				phase: event.phase,
				loss,
			}));
			const session = {
				...state.session,
				step: event.phase === "distill" ? state.session.step : event.step,
				revision: event.revision,
				phaseSteps: event.phaseSteps,
			};
			if (event.phase === "distill") {
				return {
					...state,
					session,
					step: event,
					divergences: [...state.divergences, ...event.losses].slice(
						-CURVE_LIMIT,
					),
				};
			}
			return {
				...state,
				session,
				step: event,
				curve:
					event.phase === "rl"
						? state.curve
						: [...state.curve, ...points].slice(-CURVE_LIMIT),
			};
		}
		case "probe":
			return {
				...state,
				probe: event,
				dreams:
					event.dream && state.dreams.at(-1)?.step !== event.dream.step
						? [...state.dreams, event.dream].slice(-6)
						: state.dreams,
				evaluations:
					state.evaluations.at(-1)?.step === event.step ||
					state.operation?.phase === "distill"
						? state.evaluations
						: [
								...state.evaluations,
								{
									step: event.step,
									phase: state.operation?.phase ?? "pretrain",
									heldOutLoss: event.heldOutLoss,
									accuracy: event.accuracy,
								},
							],
			};
		case "rollout":
			return {
				...state,
				rollout: event,
				rewards: [...state.rewards, event.meanReward].slice(-400),
			};
		case "token":
			return { ...state, spoken: [...state.spoken, event] };
		case "distill":
			return { ...state, distill: event };
		case "error":
			return { ...state, error: event.message };
		default:
			return state;
	}
}

const STORAGE = "deepseek-lab-session";
let creating: ReturnType<typeof createSession> | null = null;

export function useLab() {
	const [state, dispatch] = useReducer(reduce, initial);
	const live = useRef<{ id: string; generation: number } | null>(null);
	const attempt = useRef(0);

	useEffect(() => {
		if (state.session) {
			live.current = {
				id: state.session.id,
				generation: state.session.generation,
			};
		}
	}, [state.session]);

	const connect = useCallback(() => {
		let source: EventSource | null = null;
		let closed = false;
		const run = attempt.current;

		const open = (id: string, fresh: boolean) => {
			if (closed) return;
			const openedAt = Date.now();
			source = new EventSource(`/experiments/deepseek/events?session=${id}`);
			source.onmessage = (message) => {
				dispatch({ kind: "event", event: JSON.parse(message.data) });
			};
			source.onerror = () => {
				if (source?.readyState !== EventSource.CLOSED || closed) return;
				source.close();
				window.sessionStorage.removeItem(STORAGE);
				// A stream that dies right after a fresh session is a server problem; a
				// later close means the session expired, so start a new model.
				if (fresh && Date.now() - openedAt < 5000)
					dispatch({ kind: "connection", connection: "down" });
				else void create(true);
			};
		};

		const create = async (replaced: boolean) => {
			dispatch({ kind: "connection", connection: "connecting", replaced });
			creating ??= createSession().finally(() => {
				creating = null;
			});
			const created = await creating;
			if (closed || run !== attempt.current) return;
			if (!created.ok) {
				dispatch({ kind: "connection", connection: created.reason });
				return;
			}
			window.sessionStorage.setItem(STORAGE, created.session.id);
			open(created.session.id, true);
		};

		const remembered = window.sessionStorage.getItem(STORAGE);
		if (remembered) open(remembered, false);
		else void create(false);

		return () => {
			closed = true;
			source?.close();
		};
	}, []);

	useEffect(() => connect(), [connect]);

	const retry = useCallback(() => {
		attempt.current += 1;
		return connect();
	}, [connect]);

	const send = useCallback(async (command: Command) => {
		const target = live.current;
		if (!target) return;
		dispatch(
			command.type === "ask"
				? { kind: "asking" }
				: { kind: "error", message: null },
		);
		const delivered = await sendCommand(target.id, {
			...command,
			commandId: crypto.randomUUID(),
			generation: target.generation,
		});
		if (!delivered) {
			dispatch({
				kind: "error",
				message: "The training worker did not answer. Try again in a moment.",
			});
		}
	}, []);

	return { state, send, retry };
}

export function isBusy(operation: OperationView | null) {
	return !!operation && !TERMINAL.includes(operation.state);
}
