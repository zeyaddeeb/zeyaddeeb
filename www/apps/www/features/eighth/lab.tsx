"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { recordedOn } from "./archive";
import {
	caption,
	count,
	DEAL_LABELS,
	DEAL_LINES,
	DEAL_SHORT,
	delftCaption,
	delftNote,
	IDLE,
	IDLE_DELFT,
	MODES,
	type Mode,
	ms,
	type Summary,
	verdict,
} from "./copy";
import { PAIRS } from "./deal";
import { type Deck, predictions, START, valid } from "./deck";
import { DeckPanel } from "./deck-panel";
import { DELFT, type Shot, shuffled, tally } from "./delft";
import { DelftPanel } from "./delft-panel";
import { type Entry, Ledger } from "./ledger";
import { score, timing } from "./referee";
import { Angles, EIGHT, Score, SIX } from "./score";
import { choose, leastKm, lightMs, SITES, type Site } from "./sites";
import { Spacetime } from "./spacetime";
import { DelftStations, Stations } from "./stations";
import { type Started, useDealer } from "./use-dealer";
import "./eighth.css";
import "./phone.css";

type View = "deck" | "light" | "runs";

const VIEWS: { view: View; label: string }[] = [
	{ view: "deck", label: "Deck" },
	{ view: "light", label: "Light cone" },
	{ view: "runs", label: "Runs" },
];

const DEFAULT_PAIR = [SITES[0], SITES[1]] as [Site, Site];
const REPLAY_MS = 1200;
const REPLAY_STEPS = 14;

interface Replay {
	shots: Shot[];
	shown: number;
	phase: "idle" | "playing" | "done";
}

function delftStatus(replay: Replay) {
	if (replay.phase === "playing")
		return `${count(replay.shown)} of ${count(DELFT.trials)} trials`;
	if (replay.phase === "done") return "Published counts";

	return `${count(DELFT.trials)} published trials`;
}

function status(phase: string, dealt: number, started: Started | null) {
	const when = started?.recorded ? recordedOn(started.recorded) : null;

	if (phase === "checking") return "Checking the three sites";
	if (phase === "busy")
		return "Someone else is dealing. Try again in a few seconds.";
	if (phase === "dealing")
		return when
			? `Clusters off: replaying ${when}`
			: started?.browser
				? "Shuffling in your browser"
				: `${count(dealt)} of ${count(PAIRS)} pairs`;
	if (phase === "done" && when && started?.resampled)
		return `Re-dealt from ${count(started.pool)} recorded trials`;
	if (phase === "done" && when) return `Recorded ${when}`;
	if (phase === "done") return `${count(dealt)} pairs dealt`;

	return "One pair every 0.5 ms";
}

export function EighthLab() {
	const { run, sites, deal } = useDealer();
	const [kind, setKind] = useState<Mode>("deck");
	const [replay, setReplay] = useState<Replay>({
		shots: [],
		shown: 0,
		phase: "idle",
	});
	const timers = useRef<number[]>([]);
	const reduced = useReducedMotion();
	const [deck, setDeck] = useState<Deck>(START);
	const [asked, setAsked] = useState<[Site, Site] | null>(null);
	const [view, setView] = useState<View>("deck");
	const [ledger, setLedger] = useState<Entry[]>([]);
	const logged = useRef<number>(0);
	const runs = useRef(0);

	const live = useMemo(
		() =>
			sites && !sites.off
				? sites.seen.filter((s) => s.live).map((s) => s.site)
				: SITES.map((s) => s.id),
		[sites],
	);
	const auto = choose(live) ?? DEFAULT_PAIR;
	const picked = asked ?? auto;
	const started = run.started;
	const pair: [Site, Site] = started ? [started.west, started.east] : picked;
	const light = started
		? started.lightUs / 1000
		: lightMs(leastKm(pair[0], pair[1]));

	const summary = useMemo<Summary | null>(() => {
		if (!started) return null;

		const honest = score(run.trials, "honest");
		const dropped = score(run.trials, "drop");

		return {
			deal: started.deal,
			browser: started.browser,
			west: started.west,
			east: started.east,
			honest,
			dropped,
			timing: started.browser
				? null
				: timing(run.trials, started.lightUs, run.clocks),
			lightMs: started.lightUs / 1000,
			lostSite: run.lostSite,
			done: run.phase === "done",
		};
	}, [started, run.trials, run.clocks, run.lostSite, run.phase]);

	const log = useCallback((entry: Omit<Entry, "n">) => {
		logged.current = runs.current;
		setLedger((entries) =>
			[{ n: runs.current, ...entry }, ...entries].slice(0, 3),
		);
	}, []);

	useEffect(() => {
		if (run.phase !== "done" || !summary || logged.current === runs.current)
			return;

		const shown = summary.deal === "dark" ? summary.dropped : summary.honest;

		log({
			deal: summary.deal,
			pair: `${summary.west.short} · ${summary.east.short}`,
			match: shown.agree[1] ?? null,
			verdict: started?.recorded
				? `${verdict(summary)}, recorded`
				: verdict(summary),
		});
	}, [run.phase, summary, log, started?.recorded]);

	const shots = useMemo(
		() => replay.shots.slice(0, replay.shown),
		[replay.shots, replay.shown],
	);
	const delftTally = useMemo(() => tally(shots), [shots]);

	useEffect(() => {
		if (replay.phase !== "done" || logged.current === runs.current) return;

		log({
			deal: "delft",
			pair: "Lab A · Lab B",
			match: delftTally.rate,
			verdict: "loophole-free",
		});
	}, [replay.phase, delftTally.rate, log]);

	useEffect(
		() => () => {
			for (const t of timers.current) window.clearTimeout(t);
		},
		[],
	);

	const delft = kind === "delft";
	const busy =
		run.phase === "checking" ||
		run.phase === "dealing" ||
		replay.phase === "playing";
	const canDeal = !busy && (kind !== "deck" || valid(deck));
	const shown = summary
		? summary.deal === "dark"
			? summary.dropped
			: summary.honest
		: null;
	const t = summary?.timing ?? null;
	const scale = delft ? EIGHT : SIX;
	const angles = delft
		? delftTally.perPair
		: (shown?.agree ?? [null, null, null, null]);

	const replayDelft = () => {
		const all = shuffled(Math.random);

		for (const t of timers.current) window.clearTimeout(t);
		timers.current = [];

		if (reduced) {
			setReplay({ shots: all, shown: all.length, phase: "done" });
			return;
		}

		setReplay({ shots: all, shown: 0, phase: "playing" });

		for (let i = 1; i <= REPLAY_STEPS; i++)
			timers.current.push(
				window.setTimeout(
					() =>
						setReplay((r) => ({
							...r,
							shown: Math.round((all.length * i) / REPLAY_STEPS),
							phase: i === REPLAY_STEPS ? "done" : "playing",
						})),
					(REPLAY_MS * i) / REPLAY_STEPS,
				),
			);
	};

	const start = () => {
		if (!canDeal) return;

		runs.current += 1;

		if (kind === "delft") replayDelft();
		else deal(kind, deck, asked ? asked.map((s) => s.id) : null);
	};

	const timingLine = !summary
		? `${pair[0].place} to ${pair[1].place}: at least ${count(Math.round(leastKm(pair[0], pair[1])))} km.`
		: summary.browser
			? "No clocks were read: the browser has no light cone."
			: !t || t.timed === 0
				? "Waiting for the stations’ clocks."
				: summary.lightMs < 1
					? `Light needs ${ms(summary.lightMs, 2)} between these two, so no answer can beat it.`
					: t.late > 0
						? `${count(t.late)} of ${count(t.timed)} answers came after light could have brought the other dial${t.packetMs ? `. Dials crossed the mesh in ${ms(t.packetMs)}` : ""}.`
						: t.unmeasured
							? "A station couldn’t read its cloud’s time server, so nothing can be certified."
							: t.loose > 0
								? `Light needs ${ms(summary.lightMs)} and the clocks agree to ±${ms(t.boundMs, 1)} together, so ${count(t.loose)} answers can’t be certified.`
								: `All ${count(t.timed)} answers came before light could bring the other dial. Closest call: ${ms(t.closestMs)} to spare.`;
	const timingNote = started?.recorded
		? `Recorded ${recordedOn(started.recorded)}. ${timingLine}`
		: timingLine;

	return (
		<div className="me" data-view={view} data-deal={kind}>
			<div className="me-left">
				<p className="me-caption" aria-live="polite">
					{delft
						? delftTally.n > 0
							? delftCaption(delftTally.won, delftTally.n, delftTally.rate)
							: IDLE_DELFT
						: summary
							? caption(summary)
							: IDLE}
				</p>
				<Score
					scale={scale}
					measured={delft ? delftTally.rate : (shown?.agree[1] ?? null)}
					error={delft ? delftTally.error : (shown?.error[1] ?? null)}
					predicted={kind === "deck" ? (predictions(deck)[1] ?? null) : null}
					run={angles}
				/>
				<div className="me-views">
					{VIEWS.map((v) => (
						<button
							key={v.view}
							type="button"
							aria-pressed={view === v.view}
							className="me-view"
							onClick={() => setView(v.view)}
						>
							{v.label}
						</button>
					))}
				</div>
				<fieldset className="me-deals">
					<legend className="me-deals__legend">How to deal</legend>
					{MODES.map((d) => (
						<button
							key={d}
							type="button"
							aria-pressed={kind === d}
							className="me-deal"
							onClick={() => setKind(d)}
						>
							<span className="me-deal__long">{DEAL_LABELS[d]}</span>
							<span className="me-deal__short" aria-hidden="true">
								{DEAL_SHORT[d]}
							</span>
						</button>
					))}
				</fieldset>
				<div className="me-slot me-stack" data-panel="deck">
					<div data-hidden={delft || undefined} inert={delft}>
						<DeckPanel
							deck={deck}
							onChange={setDeck}
							disabled={kind !== "deck"}
							line={DEAL_LINES[kind]}
						/>
					</div>
					<div data-hidden={!delft || undefined} inert={!delft}>
						<DelftPanel line={DEAL_LINES.delft} />
					</div>
				</div>
				<div className="me-action">
					<button
						type="button"
						className="me-go"
						disabled={!canDeal}
						onClick={start}
					>
						{delft
							? `Replay ${count(DELFT.trials)} trials`
							: `Deal ${count(PAIRS)} pairs`}
					</button>
					<span className="me-status">
						{delft
							? delftStatus(replay)
							: status(run.phase, run.trials.length, started)}
					</span>
				</div>
				<div className="me-slot" data-panel="runs">
					<Angles
						run={angles}
						scale={scale}
						className="me-angles me-angles--runs"
					/>
					<Ledger entries={ledger} />
				</div>
			</div>
			<div className="me-right me-slot" data-panel="light">
				{delft ? (
					<DelftStations />
				) : (
					<Stations sites={sites} pair={picked} onPick={setAsked} />
				)}
				<Spacetime
					pair={pair}
					lightMs={light}
					started={started}
					clocks={run.clocks}
					trials={run.trials}
					delft={delft}
				/>
				<p className="me-timing">
					{delft
						? delftNote(delftTally.rate, replay.phase === "done")
						: timingNote}
				</p>
			</div>
		</div>
	);
}
