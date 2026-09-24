"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	checkProof,
	loadLevels,
} from "@/app/(site)/experiments/proofs/actions";
import { number } from "@/features/catalog/catalog";
import { Board } from "./board";
import { type Level, levels } from "./levels";
import type { LevelStart, Step } from "./protocol";
import { change, hint, legend, narrate } from "./script";
import "./proofs.css";

interface Progress {
	tactics: string[];
	solved: boolean;
}

const storageKey = "proofs-progress";

function readProgress(): Record<string, Progress> {
	try {
		return JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
	} catch {
		return {};
	}
}

function writeProgress(all: Record<string, Progress>) {
	try {
		sessionStorage.setItem(storageKey, JSON.stringify(all));
	} catch {}
}

const unavailable = {
	busy: "Every Lean worker is busy. Try the move again in a few seconds.",
	down: "Lean is not reachable right now. Try again in a moment.",
	invalid: "That move could not be sent.",
};

export function ProofsLab() {
	const [starts, setStarts] = useState<LevelStart[] | null>(null);
	const [down, setDown] = useState(false);
	const [index, setIndex] = useState(0);
	const [steps, setSteps] = useState<Step[]>([]);
	const [failure, setFailure] = useState<Step | null>(null);
	const [solved, setSolved] = useState(false);
	const [tried, setTried] = useState(0);
	const [pending, setPending] = useState<string | null>(null);
	const [showHint, setShowHint] = useState(false);
	const [draft, setDraft] = useState("");
	const [timing, setTiming] = useState<{ moves: number; ms: number } | null>(
		null,
	);
	const [progress, setProgress] = useState<Record<string, Progress>>({});
	const request = useRef(0);

	const level: Level = levels[index];
	const start = starts?.find((s) => s.id === level.id);
	const tactics = steps.map((s) => s.tactic);

	useEffect(() => {
		setProgress(readProgress());
		loadLevels().then((loaded) => {
			if (loaded.ok) setStarts(loaded.levels);
			else setDown(true);
		});
	}, []);

	const remember = useCallback((id: string, next: Progress, keep = true) => {
		setProgress((all) => {
			const merged = {
				...all,
				[id]: { ...next, solved: next.solved || (keep && !!all[id]?.solved) },
			};
			writeProgress(merged);
			return merged;
		});
	}, []);

	const open = useCallback(async (to: number) => {
		const id = levels[to].id;
		const saved = readProgress()[id];
		setIndex(to);
		setSteps([]);
		setFailure(null);
		setSolved(false);
		setTried(0);
		setShowHint(false);
		setDraft("");
		if (!saved?.tactics.length) return;
		const ticket = ++request.current;
		setPending(saved.tactics.at(-1) ?? null);
		const result = await checkProof(id, saved.tactics);
		if (ticket !== request.current) return;
		setPending(null);
		if (!result.ok) return;
		const accepted = result.checked.steps.filter((s) => s.ok);
		setSteps(accepted);
		setSolved(result.checked.solved);
		setTried(accepted.length);
	}, []);

	const play = useCallback(
		async (tactic: string) => {
			const text = tactic.trim();
			if (!text || pending) return;
			const ticket = ++request.current;
			setPending(text);
			setShowHint(false);
			const result = await checkProof(level.id, [...tactics, text]);
			if (ticket !== request.current) return;
			setPending(null);
			setTried((n) => n + 1);
			if (!result.ok) {
				setFailure({
					tactic: text,
					ok: false,
					goals: [],
					error: unavailable[result.reason],
				});
				return;
			}
			const all = result.checked.steps;
			const last = all.at(-1);
			setTiming({ moves: all.length, ms: result.checked.leanMs });
			if (last?.ok) {
				setSteps(all);
				setFailure(null);
				setSolved(result.checked.solved);
				setDraft("");
				remember(level.id, {
					tactics: all.map((s) => s.tactic),
					solved: result.checked.solved,
				});
			} else {
				setSteps(all.filter((s) => s.ok));
				setFailure(last ?? null);
			}
		},
		[level.id, pending, remember, tactics],
	);

	const undo = () => {
		request.current++;
		setPending(null);
		if (failure) {
			setFailure(null);
			return;
		}
		const kept = steps.slice(0, -1);
		setSteps(kept);
		setSolved(false);
		remember(level.id, { tactics: kept.map((s) => s.tactic), solved: false });
	};

	const restart = () => {
		request.current++;
		setPending(null);
		setSteps([]);
		setFailure(null);
		setSolved(false);
		setTried(0);
		remember(level.id, { tactics: [], solved: false }, false);
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		play(draft);
	};

	const startGoals = start?.goals ?? [];
	const goals = steps.at(-1)?.goals ?? startGoals;
	const before = steps.at(-2)?.goals ?? startGoals;
	const lastOk = steps.at(-1) ?? null;
	const line = narrate(level, before, failure ?? lastOk, solved, tried);
	const added = lastOk && !failure ? change(before, goals).added : [];
	const next = hint(level, tactics);
	const finished = solved || (level.open && tried >= 2);
	const statement = start?.statement ?? "";
	const key = legend(goals);
	const status = down
		? "Lean offline"
		: !starts
			? "Starting Lean…"
			: pending
				? "Lean is checking…"
				: timing
					? `Lean ran ${timing.moves} ${timing.moves === 1 ? "move" : "moves"} in ${timing.ms < 1 ? "<1" : Math.round(timing.ms)} ms`
					: "Lean 4 is ready";
	const nextLevel = (where: "say" | "side") =>
		finished && index < levels.length - 1 ? (
			<button
				type="button"
				className={`pf-primary pf-next--${where}`}
				onClick={() => open(index + 1)}
			>
				Next level{" "}
				<span aria-hidden="true">
					<LifeArrow direction="right" />
				</span>
			</button>
		) : null;

	return (
		<div className="pf" data-solved={solved || undefined}>
			<nav className="pf-rail" aria-label="Levels">
				<ol>
					{levels.map((l, i) => (
						<li key={l.id}>
							<button
								type="button"
								aria-current={i === index ? "step" : undefined}
								data-solved={progress[l.id]?.solved || undefined}
								aria-label={`Level ${number(i + 1)}: ${l.title}${progress[l.id]?.solved ? ", proved" : ""}`}
								onClick={() => open(i)}
							>
								{number(i + 1)}
							</button>
						</li>
					))}
				</ol>
				<p className="pf-status" aria-live="polite">
					{status}
				</p>
			</nav>

			<div className="pf-screen">
				<section className="pf-board" aria-label="Proof state">
					<header className="pf-say">
						<p className="pf-eyebrow pf-say-head">
							<span>
								Level {number(index + 1)} / {level.title}
							</span>
							<span className="pf-say-status" aria-hidden="true">
								{status}
							</span>
						</p>
						<p className="pf-line" data-tone={line.tone} aria-live="polite">
							{line.text}
						</p>
						{nextLevel("say")}
					</header>

					{down ? (
						<div className="pf-offline">
							<p>
								The Lean server is not reachable, so moves cannot be checked
								right now.
							</p>
							<button type="button" onClick={() => location.reload()}>
								Try again
							</button>
						</div>
					) : (
						<Board
							goals={goals}
							solved={solved}
							added={added}
							loading={!start}
							symbols={key}
						/>
					)}

					<div
						className="pf-slot"
						data-kind={failure ? "error" : solved ? "done" : "key"}
					>
						{failure ? (
							<>
								<p className="pf-eyebrow">
									Lean says, about <code>{failure.tactic.split("\n")[0]}</code>
								</p>
								<pre className="pf-error">{failure.error}</pre>
								<p className="pf-slot-note">The board is unchanged.</p>
							</>
						) : solved ? (
							<p className="pf-proved">
								Proved<span aria-hidden="true">.</span>
								<small>
									{steps.length} {steps.length === 1 ? "move" : "moves"}, every
									one checked by Lean.
								</small>
							</p>
						) : (
							<dl className="pf-key">
								<div>
									<dt>⊢</dt>
									<dd>what you need</dd>
								</div>
								{key.map(([symbol, meaning]) => (
									<div key={symbol}>
										<dt>{symbol}</dt>
										<dd>{meaning}</dd>
									</div>
								))}
							</dl>
						)}
					</div>
				</section>

				<aside className="pf-side">
					<div className="pf-moves">
						<p className="pf-eyebrow">Moves</p>
						<ul>
							{level.moves.map((move) => (
								<li key={move.tactic}>
									<button
										type="button"
										className="pf-move"
										disabled={!start || !!pending || solved}
										data-hint={(showHint && next === move.tactic) || undefined}
										data-pending={pending === move.tactic || undefined}
										onClick={() => play(move.tactic)}
									>
										<code>{move.label ?? move.tactic}</code>
										<span>{move.says}</span>
									</button>
								</li>
							))}
						</ul>
						<div className="pf-tools">
							<button
								type="button"
								className="pf-text-button"
								onClick={undo}
								disabled={!steps.length && !failure}
							>
								Undo
							</button>
							<button
								type="button"
								className="pf-text-button"
								onClick={restart}
								disabled={!steps.length && !failure}
							>
								Start over
							</button>
							{!finished && next ? (
								<button
									type="button"
									className="pf-text-button pf-hint"
									aria-pressed={showHint}
									onClick={() => setShowHint((v) => !v)}
								>
									{showHint ? "Hide hint" : "Stuck? Show a hint"}
								</button>
							) : null}
						</div>
						<form className="pf-write" onSubmit={submit}>
							<label htmlFor="pf-draft" className="pf-eyebrow">
								Or write your own
							</label>
							<div>
								<input
									id="pf-draft"
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									placeholder="e.g. exact hp"
									autoComplete="off"
									autoCapitalize="off"
									spellCheck={false}
									maxLength={240}
									disabled={!start || solved}
								/>
								<button
									type="submit"
									disabled={!draft.trim() || !!pending || !start || solved}
								>
									Try
								</button>
							</div>
						</form>
					</div>

					<div className="pf-proof">
						<p className="pf-eyebrow">Your proof, in Lean</p>
						<pre>
							<code>
								<span className="pf-code-head">{statement} := by</span>
								{steps.map((step, i) => (
									<span
										key={`${i}-${step.tactic}`}
										className="pf-code-line"
										data-last={i === steps.length - 1 || undefined}
									>
										{step.tactic
											.split("\n")
											.map((l) => `  ${l}`)
											.join("\n")}
									</span>
								))}
								{pending ? (
									<span className="pf-code-line" data-pending>
										{`  ${pending.split("\n")[0]}`}
									</span>
								) : failure ? (
									<span className="pf-code-line" data-failed>
										{`  ${failure.tactic.split("\n")[0]}`}
									</span>
								) : null}
							</code>
						</pre>
						<div className="pf-actions">{nextLevel("side")}</div>
					</div>
				</aside>
			</div>
		</div>
	);
}
