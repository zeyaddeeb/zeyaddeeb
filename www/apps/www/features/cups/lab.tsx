"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReservedText } from "@/components/reserved-text";
import { useWasm } from "@/lib/hooks/use-wasm";
import { Chart } from "./chart";
import { CAPTIONS, caption } from "./copy";
import { glance, lostAt, Tape, write } from "./follow";
import { atOnce, notes as notesSpec, open, thousands } from "./readers";
import { belief, type Recording } from "./reasoner";
import { Table } from "./table";
import { Tape as Record } from "./tape";
import {
	CUPS,
	MOST,
	pairOf,
	randomCup,
	randomPair,
	shuffleOrder,
	trail,
} from "./task";
import { Thinking } from "./thinking";
import { useReasoner } from "./use-reasoner";
import "./cups.css";
import "./phone.css";

const SWAP_MS = 320;
const BURST = 10;
const FIRST_LAYERS = 2;
const HOME = [0, 1, 2, 3, 4];

type View = "tape" | "chart" | "big";

const VIEWS: { view: View; label: string }[] = [
	{ view: "tape", label: "Tape" },
	{ view: "chart", label: "How far" },
	{ view: "big", label: "Big one" },
];

interface Round {
	swaps: number;
	layers: number;
	notes: boolean;
	once: boolean;
}

const HINTS = [
	"Tap two cups to swap them, or let it shuffle.",
	"Cup 5 is up. Tap another cup to swap them.",
	"Shuffling, 10 swaps to go.",
	"Sixty swaps. Start a new ball to go again.",
];

function hint(picked: number | null, auto: number, n: number) {
	if (n >= MOST) return HINTS[3] ?? "";
	if (auto > 0)
		return `Shuffling, ${auto} ${auto === 1 ? "swap" : "swaps"} to go.`;
	if (picked !== null)
		return `Cup ${picked + 1} is up. Tap another cup to swap them.`;

	return HINTS[0] ?? "";
}

export function CupsLab() {
	const { wasm } = useWasm();
	const [start, setStart] = useState(2);
	const [swaps, setSwaps] = useState<number[]>([]);
	const [forged, setForged] = useState<ReadonlyMap<number, number>>(
		() => new Map(),
	);
	const [layers, setLayers] = useState(FIRST_LAYERS);
	const [picked, setPicked] = useState<number | null>(null);
	const [auto, setAuto] = useState(0);
	const [rounds, setRounds] = useState<Round[]>([]);
	const [view, setView] = useState<View>("tape");
	const [noteTape, setNoteTape] = useState<Tape | null>(null);
	const [onceTape, setOnceTape] = useState<{
		tape: Tape;
		layers: number;
	} | null>(null);

	useEffect(() => {
		if (!wasm || !notesSpec) return;

		let live = true;

		open(wasm, notesSpec).then((reader) => {
			if (live) setNoteTape(new Tape(reader));
		});

		return () => {
			live = false;
		};
	}, [wasm]);

	useEffect(() => {
		const spec = atOnce.find((s) => s.layers === layers);

		if (!wasm || !spec) return;

		let live = true;

		open(wasm, spec).then((reader) => {
			if (live) setOnceTape({ tape: new Tape(reader), layers });
		});

		return () => {
			live = false;
		};
	}, [wasm, layers]);

	const n = swaps.length;
	const truth = useMemo(() => trail(start, swaps), [start, swaps]);
	const order = useMemo(() => swaps.reduce(shuffleOrder, HOME), [swaps]);
	const ball = truth.at(-1) ?? start;
	const notes = useMemo(
		() => (noteTape ? write(noteTape, start, swaps, forged) : null),
		[noteTape, start, swaps, forged],
	);
	const once = useMemo(
		() =>
			onceTape && onceTape.layers === layers
				? glance(onceTape.tape, start, swaps)
				: null,
		[onceTape, layers, start, swaps],
	);
	const startBelief = useMemo(() => {
		const probs = new Array(CUPS).fill(0);

		probs[start] = 1;

		return { probs, pick: start };
	}, [start]);

	const reasoner = useReasoner(start, swaps);
	const big = belief(reasoner.thought);
	const lastNote = notes?.at(-1) ?? null;
	const lastOnce = once?.at(-1) ?? null;
	const firstForged = forged.size ? Math.min(...forged.keys()) : null;
	const locked = auto > 0 || n >= MOST;

	const text = caption({
		swaps: n,
		ball,
		sure: lastOnce ? (lastOnce.probs[lastOnce.pick] ?? 0) : 1,
		said: lastOnce?.pick ?? ball,
		lost: once
			? lostAt(
					once.map((b) => b.pick),
					truth,
				)
			: null,
		slipped: notes
			? lostAt(
					notes.map((note) => note.wrote),
					truth,
				)
			: null,
		wrote: lastNote?.wrote ?? ball,
		forged: firstForged,
	});

	const add = useCallback((pair: number) => {
		setSwaps((s) => (s.length >= MOST ? s : [...s, pair]));
	}, []);

	useEffect(() => {
		if (auto <= 0) return;

		if (n >= MOST) {
			setAuto(0);
			return;
		}

		const timer = window.setTimeout(() => {
			add(randomPair());
			setAuto((a) => a - 1);
		}, SWAP_MS);

		return () => window.clearTimeout(timer);
	}, [auto, n, add]);

	const tap = useCallback(
		(slot: number) => {
			if (locked) return;

			if (picked === null) {
				setPicked(slot);
				return;
			}

			setPicked(null);

			if (picked !== slot) add(pairOf(picked, slot));
		},
		[locked, picked, add],
	);

	const fresh = useCallback(() => {
		if (n > 0 && lastNote && lastOnce)
			setRounds((r) => [
				...r,
				{
					swaps: n,
					layers,
					notes: lastNote.wrote === ball,
					once: lastOnce.pick === ball,
				},
			]);

		setStart(randomCup());
		setSwaps([]);
		setForged(new Map());
		setPicked(null);
		setAuto(0);
	}, [n, lastNote, lastOnce, layers, ball]);

	const shuffle = useCallback(() => {
		setPicked(null);
		setAuto((a) => (a > 0 ? 0 : Math.min(BURST, MOST - n)));
	}, [n]);

	const play = (recording: Recording) => {
		setStart(recording.start);
		setSwaps([...recording.swaps]);
		setForged(new Map());
		setPicked(null);
		setAuto(0);
		setView("big");
		reasoner.replay(recording);
	};

	const forge = (i: number) => {
		const note = notes?.[i];

		if (!note) return;

		setForged((m) => new Map(m).set(i, (note.wrote + 1) % CUPS));
	};

	const keys = useRef({ tap, fresh, shuffle });
	keys.current = { tap, fresh, shuffle };

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;

			const el = e.target as HTMLElement | null;

			if (el?.closest("input, textarea, select, [contenteditable]")) return;

			const digit = Number(e.key);

			if (digit >= 1 && digit <= CUPS) keys.current.tap(digit - 1);
			else if (e.key === "s" || e.key === "S") keys.current.shuffle();
			else if (e.key === "n" || e.key === "N") keys.current.fresh();
			else if (e.key === "Escape") setPicked(null);
		};

		window.addEventListener("keydown", onKey);

		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const right = (who: "notes" | "once") => rounds.filter((r) => r[who]).length;
	const chosen = atOnce.find((s) => s.layers === layers);

	return (
		<div className="sw" data-view={view}>
			<div className="sw-left">
				<p className="sw-caption" aria-live="polite">
					<ReservedText text={text} samples={CAPTIONS} />
				</p>

				<Table
					order={order}
					ball={start}
					picked={picked}
					last={n > 0 ? { pair: swaps[n - 1] ?? 0, n } : null}
					notes={n === 0 ? (notes ? startBelief : null) : lastNote}
					once={n === 0 ? (once ? startBelief : null) : lastOnce}
					words={big}
					asked={reasoner.source !== "none"}
					layers={layers}
					locked={locked}
					onCup={tap}
				/>

				<div className="sw-controls">
					<p className="sw-hint">
						<ReservedText text={hint(picked, auto, n)} samples={HINTS} />
					</p>
					<button
						type="button"
						className="sw-button sw-button--go"
						aria-keyshortcuts="s"
						disabled={n >= MOST}
						onClick={shuffle}
					>
						{auto > 0
							? "Stop"
							: `Shuffle ${Math.min(BURST, MOST - n) || BURST}`}
					</button>
					<button
						type="button"
						className="sw-button"
						aria-keyshortcuts="n"
						onClick={fresh}
					>
						New ball
					</button>
				</div>

				<div className="sw-views" role="tablist">
					{VIEWS.map((v) => (
						<button
							key={v.view}
							type="button"
							role="tab"
							aria-selected={v.view === view}
							className="sw-button sw-views__option"
							data-view={v.view}
							onClick={() => setView(v.view)}
						>
							{v.label}
						</button>
					))}
				</div>

				<div className="sw-record">
					<Record
						swaps={swaps}
						truth={truth}
						notes={notes}
						once={once}
						locked={auto > 0}
						onForge={forge}
					/>
					<p className="sw-forge">
						<span
							className="sw-forge__hint"
							data-short="Tap a note to change it."
						>
							<span className="sw-full">
								Tap a note to change what it wrote.
							</span>
						</span>
						<button
							type="button"
							className="sw-button sw-button--quiet"
							disabled={forged.size === 0}
							onClick={() => setForged(new Map())}
						>
							<span data-short="Put back">
								<span className="sw-full">Put its notes back</span>
							</span>
						</button>
					</p>
				</div>
			</div>

			<div className="sw-right">
				<div className="sw-tabs" role="tablist">
					{VIEWS.slice(1).map((v) => (
						<button
							key={v.view}
							type="button"
							role="tab"
							aria-selected={
								v.view === view || (v.view === "chart" && view === "tape")
							}
							className="sw-button sw-views__option"
							onClick={() => setView(v.view)}
						>
							{v.view === "big" ? "Ask a big one" : v.label}
						</button>
					))}
				</div>

				<Thinking
					thought={reasoner.thought}
					source={reasoner.source}
					trouble={reasoner.trouble}
					recorded={reasoner.recorded}
					truth={ball}
					swaps={n}
					onAsk={() => {
						setAuto(0);
						reasoner.ask();
					}}
					onAct={(action) => {
						reasoner.act(action);
					}}
					onReplay={play}
				/>

				<div className="sw-reach">
					<Chart once={atOnce} notes={notesSpec} layers={layers} now={n} />

					<div className="sw-depth">
						<span className="sw-depth__label">Answers at once gets</span>
						<span className="sw-depth__options">
							{atOnce.map((s) => (
								<button
									key={s.id}
									type="button"
									className="sw-button sw-depth__option"
									aria-pressed={s.layers === layers}
									onClick={() => setLayers(s.layers)}
								>
									{s.layers}
								</button>
							))}
						</span>
						<span className="sw-depth__label">layers</span>
						<span className="sw-depth__size">
							{chosen ? `${thousands(chosen.parameters)} numbers` : ""}
							{notesSpec
								? `, against ${thousands(notesSpec.parameters)} for Writes it down`
								: ""}
						</span>
					</div>
				</div>

				<p className="sw-why">
					Every answer gets the same fixed amount of work: one pass through its
					layers. Each swap adds a little more to follow, so any fixed number of
					layers runs out. Writing the ball down after every swap turns one long
					problem into many one-swap problems, and one layer is enough for each.
				</p>

				<dl className="sw-score">
					<div className="sw-score__item">
						<dt>Rounds</dt>
						<dd>{rounds.length}</dd>
					</div>
					<div className="sw-score__item" data-who="notes">
						<dt data-short="Notes">
							<span className="sw-full">Writes it down</span>
						</dt>
						<dd>{right("notes")}</dd>
					</div>
					<div className="sw-score__item" data-who="once">
						<dt data-short="At once">
							<span className="sw-full">Answers at once</span>
						</dt>
						<dd>{right("once")}</dd>
					</div>
				</dl>
			</div>
		</div>
	);
}
