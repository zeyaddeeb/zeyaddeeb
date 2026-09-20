"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bet, Choices, Score, Writer } from "./board";
import { Cards, Reading, Rollouts, Yours } from "./lenses";
import { ExamplePicker, Inside, Line } from "./line";
import {
	type ActionId,
	CHAPTERS,
	type Flags,
	NO_FLAGS,
	shot,
	slotOf,
	spotlight,
	step,
} from "./script";
import { isBusy, useLab } from "./use-lab";
import "./lab.css";

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
	return (
		target instanceof HTMLElement &&
		target.closest("button, a, summary") !== null
	);
}

export function DeepSeekLab() {
	const { state, send, retry } = useLab();
	const session = state.session;
	const probe = state.probe;
	const flagsKey = session
		? `deepseek-lab-story:${session.id}:${session.generation}`
		: null;
	const [flags, setFlags] = useState<Flags>(NO_FLAGS);
	const [selected, setSelected] = useState<number | null>(null);
	const [inside, setInside] = useState(false);
	const [layer, setLayer] = useState<number | null>(null);
	const [confirming, setConfirming] = useState(false);

	useEffect(() => {
		if (!flagsKey) return;
		const stored = window.sessionStorage.getItem(flagsKey);
		const saved = stored ? JSON.parse(stored) : {};
		setFlags({ ...NO_FLAGS, ...saved, at: { ...NO_FLAGS.at, ...saved.at } });
	}, [flagsKey]);
	const raise = useCallback(
		(change: (current: Flags) => Flags) => {
			setFlags((current) => {
				const next = change(current);
				if (flagsKey)
					window.sessionStorage.setItem(flagsKey, JSON.stringify(next));
				return next;
			});
		},
		[flagsKey],
	);

	const story = useMemo(
		() => shot(state, { flags, selected }),
		[state, flags, selected],
	);
	const scene = story.scene;
	const codeOnly = scene.line !== "asked";
	const busy = isBusy(state.operation);
	const rays = scene.rays || inside;

	const lineKey = probe ? `${probe.line.code}|${probe.line.question}` : "";
	const slot = scene.slot;
	useEffect(() => {
		if (!probe) return;
		if (slot) setSelected(slotOf(probe, slot));
		else setSelected((current) => current ?? slotOf(probe, "number"));
	}, [lineKey, slot, story.id]);

	const looking = story.id === "looks";
	const focusKey = probe
		? `${lineKey}|${probe.focus.position}|${probe.revision}`
		: "";
	useEffect(() => {
		if (looking) setLayer(spotlight(probe)?.layer ?? null);
	}, [looking, focusKey]);

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

	const show = (code: string, question: string) =>
		void send({ type: "show", code, question });

	const move = (by: 1 | -1) => raise((current) => step(current, story, by));

	const act = (id: ActionId) => {
		setConfirming(false);
		switch (id) {
			case "next":
				return move(1);
			case "back":
				return move(-1);
			case "pretrain":
			case "sft":
			case "rl":
			case "distill":
				if (id === "distill") raise((current) => ({ ...current, own: true }));
				return send({ type: "start", phase: id, steps: STEPS[id] });
			case "ask":
				return raise((current) => ({ ...current, asked: true, view: null }));
			case "own":
				setInside(false);
				return raise((current) => ({ ...current, own: true, view: null }));
			case "another": {
				if (!probe?.examples.length) return;
				const at = probe.examples.findIndex(
					(e) =>
						e.code === probe.line.code && e.question === probe.line.question,
				);
				const next = probe.examples[(at + 1) % probe.examples.length];
				return show(next.code, next.question);
			}
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

	const pick = (text: string) =>
		raise((current) => ({
			...current,
			pick: text,
			at: { ...current.at, guess: 1 },
		}));

	const chapterIndex = CHAPTERS.findIndex((c) => c.id === story.chapter);
	const running =
		state.operation?.state === "running" &&
		state.operation.phase !== "generate";
	const paused = state.operation?.state === "paused";
	const free = scene.line !== "covered" && scene.line !== "none";

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
					if (!free || selected === null || slots.length === 0) return;
					const at = slots.indexOf(selected);
					const step = event.key === "ArrowRight" ? 1 : -1;
					const next =
						at < 0
							? slots[0]
							: slots[(at + step + slots.length) % slots.length];
					setSelected(next);
					break;
				}
				default:
					return;
			}
			event.preventDefault();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [running, paused, selected, slots, free, send]);

	const operation = state.operation;
	const eta =
		operation && running && state.step
			? remaining(
					((operation.stepsTotal - operation.stepsDone) * state.step.stepMs) /
						1000,
				)
			: null;
	const bench = story.chapter !== "guess" && !!probe && !!session;
	const trained = !!session && session.step + session.phaseSteps.distill > 0;

	return (
		<div
			className="ds"
			data-chapter={story.chapter}
			data-shot={story.id}
			data-running={running}
		>
			<header className="ds-rail">
				<ol aria-label="Chapters">
					{CHAPTERS.map((chapter, i) => (
						<li
							key={chapter.id}
							aria-current={i === chapterIndex ? "step" : undefined}
							data-state={
								i < chapterIndex ? "done" : i === chapterIndex ? "now" : "later"
							}
						>
							<b>{chapter.numeral}</b>
							<span>{chapter.label}</span>
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

			<div className="ds-screen">
				<div className="ds-board" data-figure={scene.figure}>
					{probe && session && selected !== null ? (
						<>
							{scene.line !== "none" ? (
								<Line
									probe={probe}
									codeOnly={codeOnly}
									answerOnly={story.id === "tuning"}
									selected={selected}
									onSelect={setSelected}
									covered={scene.line === "covered"}
									bars={scene.bars}
									rays={rays}
									layer={layer}
								/>
							) : null}
							<div className="ds-figure" key={scene.figure}>
								{scene.choices.length ? (
									<Choices
										prompt={scene.prompt}
										options={scene.choices}
										onPick={pick}
									/>
								) : scene.figure === "bet" ? (
									<Bet
										key={`bet:${session.id}:${session.generation}`}
										probe={probe}
										model={session.model}
										selected={selected}
										marked={scene.truth}
									/>
								) : scene.figure === "writer" ? (
									<Writer dreams={state.dreams} />
								) : scene.figure === "score" ? (
									<Score probe={probe} />
								) : scene.figure === "attempts" ? (
									<Rollouts state={state} />
								) : scene.figure === "ask" ? (
									<Yours
										state={state}
										busy={busy}
										onAsk={(code, question) =>
											void send({ type: "ask", code, question })
										}
									/>
								) : null}
							</div>
						</>
					) : (
						<div className="ds-empty" aria-hidden="true" />
					)}
				</div>

				<aside
					className="ds-caption-band"
					aria-live="polite"
					data-pinned={
						!!(
							story.primary ||
							story.secondary.length ||
							story.waiting ||
							scene.choices.length
						)
					}
				>
					<p className="ds-eyebrow ds-chapter">
						<b>{CHAPTERS[chapterIndex].numeral}</b>
						{CHAPTERS[chapterIndex].label}
					</p>
					<div className="ds-say" key={story.id}>
						{story.say
							.filter((sentence) => sentence.length)
							.map((sentence, i) => (
								<p key={i}>
									{sentence.map((phrase, at) =>
										typeof phrase === "string" ? (
											phrase
										) : (
											<span key={at} data-tone={phrase.tone}>
												{phrase.text}
											</span>
										),
									)}
								</p>
							))}
						{story.note ? <p className="ds-note">{story.note}</p> : null}
						{story.kept ? <p className="ds-kept">{story.kept}</p> : null}
						{state.error && story.chapter !== "yours" ? (
							<p className="ds-form-error" role="alert">
								{state.error}
							</p>
						) : null}
					</div>
					<div className="ds-controls">
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
					</div>
				</aside>
			</div>

			{bench ? (
				<section className="ds-bench" aria-label="Workbench">
					<h3 className="ds-eyebrow">Workbench</h3>
					<details>
						<summary>Change the line</summary>
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
					</details>
					<details
						open={inside}
						onToggle={(event) => setInside(event.currentTarget.open)}
					>
						<summary>Inside the model</summary>
						<Inside
							probe={probe}
							model={session.model}
							layer={layer}
							onLayer={setLayer}
						/>
					</details>
					<details>
						<summary>Training record</summary>
						<Reading state={state} />
					</details>
					{session.phaseSteps.sft > 0 ? (
						<details>
							<summary>Held-out questions</summary>
							<Cards state={state} onShow={show} />
						</details>
					) : null}
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
				</section>
			) : null}

			<div className="ds-footer">
				{trained ? (
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
							Start over with a new model
						</button>
					)
				) : null}
				<p className="ds-keys" aria-hidden="true">
					{free ? (
						<span>
							<kbd>←</kbd>
							<kbd>→</kbd> move the box
						</span>
					) : null}
					{running || paused ? (
						<span>
							<kbd>space</kbd> {paused ? "resume" : "pause"}
						</span>
					) : null}
				</p>
			</div>
		</div>
	);
}
