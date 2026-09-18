"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type ActionId, BEATS, type Flags, guide, spotlight } from "./guide";
import { Cards, Reading, Rollouts, Yours } from "./lenses";
import { ExamplePicker, Expected, Inside, Line } from "./line";
import { isBusy, useLab } from "./use-lab";
import "./lab.css";

const NO_FLAGS: Flags = { asked: false, looked: false, own: false };
const STEPS = { pretrain: 400, sft: 600, rl: 60, distill: 400 } as const;

const count = (value: number) => value.toLocaleString("en-US");

function remaining(seconds: number) {
	if (seconds < 5) return "almost done";
	if (seconds < 60) return `about ${Math.round(seconds / 5) * 5} s left`;
	return `about ${Math.round(seconds / 60)} min left`;
}

function typing(target: EventTarget | null) {
	return (
		target instanceof HTMLElement &&
		target.closest("input, textarea, select, [contenteditable]") !== null
	);
}

function clickable(target: EventTarget | null) {
	return target instanceof HTMLElement && target.closest("button, a") !== null;
}

export function DeepSeekLab() {
	const { state, send, retry } = useLab();
	const session = state.session;
	const probe = state.probe;
	const flagsKey = session
		? `deepseek-lab-flags:${session.id}:${session.generation}`
		: null;
	const [flags, setFlags] = useState<Flags>(NO_FLAGS);
	const [selected, setSelected] = useState<number | null>(null);
	const [inside, setInside] = useState(false);
	const [layer, setLayer] = useState<number | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [expanded, setExpanded] = useState(false);

	useEffect(() => {
		if (!flagsKey) return;
		const stored = window.sessionStorage.getItem(flagsKey);
		setFlags(stored ? { ...NO_FLAGS, ...JSON.parse(stored) } : NO_FLAGS);
	}, [flagsKey]);
	const raise = useCallback(
		(change: Partial<Flags>) => {
			setFlags((current) => {
				const next = { ...current, ...change };
				if (flagsKey)
					window.sessionStorage.setItem(flagsKey, JSON.stringify(next));
				return next;
			});
		},
		[flagsKey],
	);

	const story = useMemo(
		() => guide(state, { flags, inside }),
		[state, flags, inside],
	);
	const codeOnly = story.beat === "random" || story.beat === "reads";
	const busy = isBusy(state.operation);

	const lineKey = probe
		? `${probe.line.code}|${probe.line.question}|${codeOnly}`
		: "";
	useEffect(() => {
		if (!probe) return;
		const tokens = probe.line.tokens;
		const lastNumber = tokens.reduce(
			(found, t, i) => (t.role === "code" && /^\d+$/.test(t.text) ? i : found),
			-1,
		);
		setSelected(codeOnly ? Math.max(1, lastNumber) : tokens.length);
	}, [lineKey]);

	const focus = probe?.focus.position;
	const live = state.connection === "live";
	useEffect(() => {
		if (!live || selected === null || focus === undefined) return;
		if (selected - 1 === focus) return;
		const ask = () => void send({ type: "focus", position: selected - 1 });
		ask();
		const timer = window.setInterval(ask, 4000);
		return () => window.clearInterval(timer);
	}, [live, selected, focus, send]);

	const act = (id: ActionId) => {
		setConfirming(false);
		setExpanded(false);
		switch (id) {
			case "pretrain":
			case "sft":
			case "rl":
			case "distill":
				if (id === "distill") raise({ own: true });
				return send({ type: "start", phase: id, steps: STEPS[id] });
			case "reveal":
				return raise({ asked: true });
			case "own":
				setInside(false);
				return raise({ own: true });
			case "look":
				raise({ looked: true });
				setInside(true);
				setLayer(spotlight(probe)?.layer ?? null);
				if (probe) setSelected(probe.line.tokens.length);
				return;
			case "unlook":
				return setInside(false);
			case "pause":
			case "resume":
				return send({ type: id });
			case "cancel":
				return send({
					type: "cancel",
					operationId: state.operation?.operationId,
				});
			case "retry":
				return retry();
		}
	};

	const show = (code: string, question: string) =>
		void send({ type: "show", code, question });

	const beatIndex = BEATS.findIndex((b) => b.id === story.beat);
	const running =
		state.operation?.state === "running" &&
		state.operation.phase !== "generate";
	const paused = state.operation?.state === "paused";

	const slots = useMemo(() => {
		if (!probe) return [];
		const code = probe.line.tokens
			.map((t, i) => (t.role === "code" ? i : -1))
			.filter((i) => i >= 0);
		return codeOnly ? code : [...code, probe.line.tokens.length];
	}, [probe, codeOnly]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (typing(event.target)) return;
			switch (event.key) {
				case " ":
					if (clickable(event.target)) return;
					if (running) send({ type: "pause" });
					else if (paused) send({ type: "resume" });
					else return;
					break;
				case "ArrowLeft":
				case "ArrowRight": {
					if (selected === null || slots.length === 0) return;
					const at = slots.indexOf(selected);
					const step = event.key === "ArrowRight" ? 1 : -1;
					const next =
						at < 0
							? slots[0]
							: slots[(at + step + slots.length) % slots.length];
					setSelected(next);
					break;
				}
				case "Escape":
					if (!inside) return;
					setInside(false);
					break;
				default:
					return;
			}
			event.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [running, paused, selected, slots, inside, send]);

	const steps = session?.phaseSteps;
	const tally: Partial<Record<(typeof BEATS)[number]["id"], string>> = steps
		? {
				reads:
					steps.pretrain > 0 ? `${count(steps.pretrain)} updates` : undefined,
				answers:
					steps.sft > 0 && probe
						? `${Math.round(probe.accuracy * 100)}% correct`
						: undefined,
				practices: steps.rl > 0 ? `${count(steps.rl)} rounds` : undefined,
				yours: steps.distill > 0 ? "student trained" : undefined,
			}
		: {};

	const operation = state.operation;
	const eta =
		operation && running && state.step
			? remaining(
					((operation.stepsTotal - operation.stepsDone) * state.step.stepMs) /
						1000,
				)
			: null;

	return (
		<div
			className="ds"
			data-beat={story.beat}
			data-running={running}
			data-inside={inside}
		>
			<header className="ds-rail">
				<ol aria-label="Training stages">
					{BEATS.map((beat, i) => (
						<li
							key={beat.id}
							aria-current={i === beatIndex ? "step" : undefined}
							data-state={
								i < beatIndex ? "done" : i === beatIndex ? "now" : "later"
							}
						>
							<i aria-hidden="true" />
							<span>
								{beat.label}
								{i <= beatIndex && tally[beat.id] ? (
									<small>{tally[beat.id]}</small>
								) : null}
							</span>
						</li>
					))}
				</ol>
				<p className="ds-meter" aria-live="off">
					{session ? (
						<>
							<span>{count(session.model.parameters)} weights</span>
							<span>update {count(session.step)}</span>
							{running && state.step ? (
								<span>{Math.round(state.step.stepMs)} ms each</span>
							) : null}
							{state.connection !== "live" ? (
								<span className="ds-reconnect" role="status">
									reconnecting
								</span>
							) : null}
						</>
					) : (
						<span>connecting</span>
					)}
				</p>
			</header>

			<div className="ds-body">
				<div className="ds-stage">
					{probe && session && selected !== null ? (
						<>
							<ExamplePicker
								key={`picker:${session.id}:${session.generation}`}
								probe={probe}
								onShow={show}
								disabled={
									state.connection !== "live" ||
									(busy &&
										(state.operation?.phase === "generate" ||
											state.operation?.phase === "distill"))
								}
								error={state.error}
							/>
							<Line
								probe={probe}
								codeOnly={codeOnly}
								answerOnly={state.operation?.phase === "sft" && busy}
								selected={selected}
								onSelect={setSelected}
								inside={inside}
								layer={layer}
							/>
							<Expected
								key={`expected:${session.id}:${session.generation}`}
								probe={probe}
								model={session.model}
								selected={selected}
							/>
							<div className="ds-lens">
								<div className="ds-lens-head">
									<h3 className="ds-eyebrow">
										{inside
											? "Selected token"
											: {
													random: "Training results",
													reads: "Training results",
													answers: "Held-out questions",
													practices: "Feedback results",
													yours:
														state.operation?.phase === "distill" && busy
															? "Student training"
															: "Test a prompt",
												}[story.beat]}
									</h3>
									<button
										type="button"
										className="ds-inside-toggle"
										aria-expanded={inside}
										onClick={() => setInside((open) => !open)}
									>
										{inside ? "Back to results" : "Inspect model"}
									</button>
								</div>
								{inside ? (
									<Inside
										probe={probe}
										model={session.model}
										layer={layer}
										onLayer={setLayer}
									/>
								) : story.beat === "answers" ? (
									<Cards state={state} onShow={show} />
								) : story.beat === "practices" ? (
									<Rollouts state={state} />
								) : story.beat === "yours" ? (
									<Yours
										state={state}
										busy={busy}
										onAsk={(code, question) =>
											void send({ type: "ask", code, question })
										}
									/>
								) : (
									<Reading state={state} />
								)}
							</div>
						</>
					) : (
						<div className="ds-empty" aria-hidden="true" />
					)}
				</div>

				<div className="ds-side">
					<aside
						className="ds-guide"
						aria-live="polite"
						data-expanded={expanded}
						data-pinned={!!(story.primary || story.waiting)}
					>
						<p className="ds-eyebrow ds-guide-count">
							{String(beatIndex + 1).padStart(2, "0")} /{" "}
							{String(BEATS.length).padStart(2, "0")} · {BEATS[beatIndex].label}
						</p>
						<h2>
							{story.title.replace(/\.$/, "")}
							{story.title.endsWith(".") ? (
								<span className="ds-stop">.</span>
							) : null}
						</h2>
						<div className="ds-guide-body">
							{story.body.map((paragraph) => (
								<p key={paragraph}>{paragraph}</p>
							))}
							{story.kept ? <p className="ds-kept">{story.kept}</p> : null}
							{state.error && story.beat !== "yours" ? (
								<p className="ds-form-error" role="alert">
									{state.error}
								</p>
							) : null}
							{story.hint ? <p className="ds-hint">{story.hint}</p> : null}
						</div>
						{story.body.length > 1 || story.hint ? (
							<button
								type="button"
								className="ds-quiet ds-more"
								aria-expanded={expanded}
								onClick={() => setExpanded((open) => !open)}
							>
								{expanded ? "Less detail" : "More detail"}
							</button>
						) : null}
						<div className="ds-actions">
							{story.primary ? (
								<button
									type="button"
									className="ds-primary"
									onClick={() => act(story.primary?.id as ActionId)}
								>
									{story.primary.label}
								</button>
							) : story.waiting ? (
								<p className="ds-waiting" role="status">
									<i aria-hidden="true" />
									{story.waiting}
								</p>
							) : null}
							{story.secondary.map((action) => (
								<button
									key={action.id}
									type="button"
									className="ds-quiet"
									onClick={() => act(action.id)}
								>
									{action.label}
								</button>
							))}
						</div>
						{operation && busy && operation.phase !== "generate" ? (
							<div className="ds-progress-block">
								<div
									className="ds-progress"
									role="progressbar"
									aria-valuemin={0}
									aria-valuemax={operation.stepsTotal}
									aria-valuenow={operation.stepsDone}
									aria-valuetext={`${operation.stepsDone} of ${operation.stepsTotal} updates${eta ? `, ${eta}` : ""}`}
								>
									<i style={{ width: `${operation.progress * 100}%` }} />
								</div>
								<p className="ds-progress-text" aria-hidden="true">
									<span>
										{count(operation.stepsDone)} of{" "}
										{count(operation.stepsTotal)}
									</span>
									<span>
										{operation.state === "paused"
											? "paused"
											: operation.state === "queued"
												? "waiting"
												: (eta ?? "")}
									</span>
								</p>
							</div>
						) : null}
					</aside>
					<div className="ds-footer">
						<details className="ds-activity">
							<summary>Run activity</summary>
							<p>
								{state.operation
									? `${state.operation.phase} · ${state.operation.state} · ${state.operation.stage}`
									: "No active run."}
							</p>
							<ol>
								{state.journal
									.slice(-8)
									.reverse()
									.map((entry, i) => (
										<li key={`${entry.operationId}-${entry.state}-${i}`}>
											<b>{entry.state}</b>
											<span>{entry.stage}</span>
										</li>
									))}
							</ol>
						</details>
						{session && session.step + session.phaseSteps.distill > 0 ? (
							confirming ? (
								<p className="ds-confirm">
									Reset weights and discard all training?{" "}
									<button
										type="button"
										className="ds-quiet"
										onClick={() => {
											setConfirming(false);
											setInside(false);
											void send({ type: "reset" });
										}}
									>
										Reset model
									</button>
									<button
										type="button"
										className="ds-quiet"
										onClick={() => setConfirming(false)}
									>
										Keep model
									</button>
								</p>
							) : (
								<button
									type="button"
									className="ds-quiet"
									onClick={() => setConfirming(true)}
								>
									Reset model
								</button>
							)
						) : null}
						<p className="ds-keys" aria-hidden="true">
							<span>
								<kbd>←</kbd>
								<kbd>→</kbd> along the line
							</span>
							{running || paused ? (
								<span>
									<kbd>space</kbd> {paused ? "resume" : "pause"}
								</span>
							) : null}
							{inside ? (
								<span>
									<kbd>esc</kbd> back to the run
								</span>
							) : null}
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
