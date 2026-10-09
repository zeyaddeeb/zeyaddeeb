"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { Board } from "./board";
import { Boxes, type Phase } from "./boxes";
import {
	ACROSS,
	always,
	calls,
	caption,
	down,
	MAX_ROUNDS,
	type Mode,
	money,
	type Round,
	total,
	why,
} from "./game";
import { Glyph } from "./glyph";
import { forecast, type Reading, type Take } from "./oracle";
import { copyLine, fingerprint, flip, grouped, salt, studyLine } from "./seal";
import { Tape } from "./tape";
import "./newcomb.css";
import "./phone.css";

const HOLD_MS = 1300;

interface Seal {
	mode: Mode;
	round: number;
	line: string;
	hash: string | null;
	sealed: Take;
	reading: Reading | null;
	copy: 1 | 2;
}

interface Play {
	take: Take;
	coin: boolean;
}

type View = "tape" | "table";

const VIEWS: { view: View; label: string }[] = [
	{ view: "tape", label: "Tape" },
	{ view: "table", label: "Table" },
];

const WHO: { mode: Mode; label: string }[] = [
	{ mode: "study", label: "Studies you" },
	{ mode: "copy", label: "Copies you" },
];

const said = (take: Take) => (take === 1 ? "only B" : "both");

function draft(mode: Mode, rounds: Round[]) {
	const round = rounds.length + 1;
	const s = salt();

	if (mode === "copy") {
		const copy = flip();

		return {
			mode,
			round,
			copy,
			sealed: 1 as Take,
			reading: null,
			line: copyLine(round, copy, s),
		};
	}

	const f = forecast(rounds.map((r) => r.took));

	return {
		mode,
		round,
		copy: 1 as const,
		sealed: f.take,
		reading: f.reading,
		line: studyLine(round, f.take, s),
	};
}

function status(
	phase: Phase,
	mode: Mode,
	seal: Seal | null,
	plays: Play[],
	round: number,
) {
	if (phase === "open" && seal) return `Sealed line: ${seal.line}`;
	if (phase === "sealing" || !seal) return "Sealing box B…";

	const print = seal.hash ? `fingerprint ${grouped(seal.hash)}` : "sealed";
	const first = plays[0];

	if (mode === "copy" && first)
		return `Round ${round}, play 2 of 2 · play 1 said ${said(first.take)}`;

	if (mode === "copy") return `Round ${round}, play 1 of 2 · ${print}`;

	return `Round ${round} · ${print}`;
}

export function NewcombLab() {
	const reduced = useReducedMotion();
	const [mode, setMode] = useState<Mode>("study");
	const [log, setLog] = useState<Record<Mode, Round[]>>({
		study: [],
		copy: [],
	});
	const [seal, setSeal] = useState<Seal | null>(null);
	const [plays, setPlays] = useState<Play[]>([]);
	const [open, setOpen] = useState(false);
	const [view, setView] = useState<View>("tape");
	const timer = useRef<number | null>(null);

	const rounds = log[mode];
	const round = rounds.length + 1;
	const current = seal?.mode === mode && seal.round === round;
	const done = rounds.length >= MAX_ROUNDS;
	const phase: Phase = open ? "open" : current && !done ? "ready" : "sealing";
	const last = rounds.at(-1);

	useEffect(() => {
		if (open || current || done) return;

		let live = true;
		const made = draft(mode, rounds);

		fingerprint(made.line).then((hash) => {
			if (live) setSeal({ ...made, hash });
		});

		return () => {
			live = false;
		};
	}, [open, current, done, mode, rounds]);

	const halt = useCallback(() => {
		if (timer.current !== null) window.clearTimeout(timer.current);
		timer.current = null;
	}, []);

	useEffect(() => halt, [halt]);

	const finish = useCallback(
		(done: Round) => {
			setLog((l) => ({ ...l, [mode]: [...l[mode], done] }));
			setPlays([]);
			setOpen(true);
			halt();
			timer.current = window.setTimeout(() => {
				timer.current = null;
				setOpen(false);
			}, HOLD_MS);
		},
		[mode, halt],
	);

	const take = useCallback(
		(t: Take, coin = false) => {
			if (phase !== "ready" || !seal) return;

			if (mode === "study") {
				finish({ sealed: seal.sealed, took: t, coin, reading: seal.reading });
				return;
			}

			const first = plays[0];

			if (!first) {
				setPlays([{ take: t, coin }]);
				return;
			}

			const both = [first, { take: t, coin }];
			const theirs = both[seal.copy - 1] ?? first;
			const yours = both[2 - seal.copy] ?? first;

			finish({
				sealed: theirs.take,
				took: yours.take,
				coin: first.coin || coin,
				copy: seal.copy,
			});
		},
		[phase, seal, mode, plays, finish],
	);

	const keys = useRef(take);
	keys.current = take;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

			const el = e.target as HTMLElement | null;

			if (el?.closest("input, textarea, select, [contenteditable]")) return;

			if (e.key === "1") keys.current(1);
			else if (e.key === "2") keys.current(2);
			else if (e.key === "c" || e.key === "C") keys.current(flip(), true);
		};

		window.addEventListener("keydown", onKey);

		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const choose = (next: Mode) => {
		if (next === mode) return;

		halt();
		setOpen(false);
		setPlays([]);
		setMode(next);
	};

	const restart = () => {
		halt();
		setOpen(false);
		setPlays([]);
		setSeal(null);
		setLog((l) => ({ ...l, [mode]: [] }));
	};

	const n = rounds.length;
	const steady = useMemo(
		() => ({ one: always(mode, 1, n), both: always(mode, 2, n) }),
		[mode, n],
	);

	return (
		<div className="nc" data-mode={mode} data-view={view}>
			<div className="nc-left">
				<p className="nc-caption" aria-live="polite">
					{caption(mode, rounds, mode === "copy" && plays.length === 1)}
				</p>

				<div className="nc-play">
					<Boxes
						phase={phase}
						full={last?.sealed === 1}
						took={last?.took ?? null}
						hash={current || open ? (seal?.hash ?? null) : null}
						onTake={(t) => take(t)}
					/>
					<button
						type="button"
						className="nc-coin"
						disabled={phase !== "ready"}
						aria-keyshortcuts="c"
						aria-label="Let a coin choose"
						onClick={() => take(flip(), true)}
					>
						<span className="nc-coin__disc" aria-hidden="true" />
						<span className="nc-coin__label">
							Coin <span className="nc-key">C</span>
						</span>
					</button>
				</div>

				<p className="nc-status">
					<span className="nc-status__seal">
						{phase === "open" && seal?.hash ? (
							<Glyph hash={seal.hash} className="nc-status__glyph" />
						) : null}
					</span>
					<span className="nc-status__text">
						{done
							? "The tape is full. Start over to keep going."
							: status(phase, mode, seal, plays, round)}
					</span>
				</p>

				<div className="nc-views">
					{VIEWS.map((v) => (
						<button
							key={v.view}
							type="button"
							aria-pressed={v.view === view}
							className="nc-views__option"
							onClick={() => setView(v.view)}
						>
							{v.label}
						</button>
					))}
				</div>

				<div className="nc-reel">
					<Tape
						mode={mode}
						rounds={rounds}
						pending={phase === "ready"}
						reduced={reduced}
					/>
					<p className="nc-why">{why(mode, rounds)}</p>
				</div>
			</div>

			<div className="nc-right">
				<div className="nc-who">
					<span className="nc-who__label">Who fills B</span>
					{WHO.map((w) => (
						<button
							key={w.mode}
							type="button"
							aria-pressed={w.mode === mode}
							className="nc-who__option"
							onClick={() => choose(w.mode)}
						>
							{w.label}
						</button>
					))}
					<button
						type="button"
						className="nc-restart"
						disabled={n === 0 && plays.length === 0}
						onClick={restart}
					>
						Start over
					</button>
				</div>

				<div className="nc-record">
					<Board rounds={rounds} />
					<ul className="nc-args">
						<li className="nc-arg">
							<span className="nc-arg__who">Two-boxer</span>
							<span>{ACROSS}</span>
						</li>
						<li className="nc-arg">
							<span className="nc-arg__who">One-boxer</span>
							<span>{down(rounds)}</span>
						</li>
						<li className="nc-arg">
							<span className="nc-arg__who">Predictor</span>
							<span>
								{calls(mode, rounds)}{" "}
								<a href="#free-will" className="nc-more">
									The free will bit
									<LifeArrow direction="down" className="nc-more__arrow" />
								</a>
							</span>
						</li>
					</ul>
				</div>

				<dl className="nc-score">
					<div className="nc-score__item" data-you="true">
						<dt>You</dt>
						<dd>{money(total(rounds))}</dd>
					</div>
					<div className="nc-score__item">
						<dt>Always one box</dt>
						<dd>{money(steady.one)}</dd>
					</div>
					<div className="nc-score__item">
						<dt>Always both</dt>
						<dd>{money(steady.both)}</dd>
					</div>
				</dl>
			</div>
		</div>
	);
}
