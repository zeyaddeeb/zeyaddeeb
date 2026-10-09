"use client";

import type { Crowd } from "@zeyaddeeb/wasm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/use-animation-activity";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useWasm } from "@/lib/hooks/use-wasm";
import { Actions, Examples, Ledger } from "./ledger";
import { Bet, Counts, Key, Readout } from "./legend";
import {
	BUDGET,
	caption,
	count,
	EXAMPLES,
	MAX_TERMS,
	type Tally,
	type Tile,
	type Vote,
	votes,
} from "./model";
import { type Slot, Square } from "./square";
import "./programs.css";
import "./phone.css";

const FEED_MS = 520;

function read(crowd: Crowd, terms: number[]): Tally {
	return {
		terms,
		votes: votes(crowd.bet()),
		fitting: crowd.guess_count(),
		silent: crowd.silent_count(),
		considered: crowd.considered(),
		silentMass: crowd.silent(),
		answeredMass: crowd.answered(),
		unexplored: crowd.unexplored(),
	};
}

function hintFor(terms: number[], phone: boolean) {
	const act = phone ? "Tap" : "Point at";

	if (terms.length === 0) return `${act} a tile to read its program.`;

	return `${act} a tile in either square to find it in the other. Circles mark the loudest survivors.`;
}

export function ProgramsLab() {
	const { wasm, error } = useWasm();
	const reduced = useReducedMotion();
	const phone = useMediaQuery("(max-width: 640px)");
	const [crowd, setCrowd] = useState<Crowd | null>(null);
	const [terms, setTerms] = useState<number[]>([]);
	const [guesses, setGuesses] = useState<(Vote | null)[]>([]);
	const [version, setVersion] = useState(0);
	const [focus, setFocus] = useState<Tile | null>(null);
	const [draft, setDraft] = useState("");
	const [playing, setPlaying] = useState<string | null>(null);
	const [big, setBig] = useState<Slot>(1);
	const timers = useRef<number[]>([]);

	useEffect(() => {
		if (!wasm) return;

		const made = new wasm.Crowd(BUDGET);

		setCrowd(made);

		return () => {
			setCrowd(null);
			made.free();
		};
	}, [wasm]);

	const stop = useCallback(() => {
		for (const id of timers.current) window.clearTimeout(id);
		timers.current = [];
		setPlaying(null);
	}, []);

	useEffect(() => stop, [stop]);

	const changed = useCallback(() => {
		setVersion((v) => v + 1);
		setFocus(null);
	}, []);

	const push = useCallback(
		(value: number) => {
			if (!crowd || crowd.len() >= MAX_TERMS) return;

			const before = votes(crowd.bet())[0] ?? null;

			if (!crowd.push(value)) return;

			setTerms((t) => [...t, value]);
			setGuesses((g) => [...g, before]);
			changed();
		},
		[crowd, changed],
	);

	const reset = () => {
		crowd?.clear();
		setTerms([]);
		setGuesses([]);
		setDraft("");
		changed();
	};

	const pop = () => {
		if (!crowd || crowd.len() === 0) return;

		stop();
		crowd.pop();
		setTerms((t) => t.slice(0, -1));
		setGuesses((g) => g.slice(0, -1));
		changed();
	};

	const clear = () => {
		stop();
		reset();
	};

	const commit = () => {
		if (draft === "" || draft === "-") return;

		stop();
		push(Number(draft));
		setDraft("");
	};

	const feed = (id: string) => {
		const example = EXAMPLES.find((e) => e.id === id);

		if (!crowd || !example) return;

		stop();
		reset();

		if (reduced) {
			for (const v of example.terms) push(v);
			return;
		}

		setPlaying(id);
		timers.current = example.terms.map((v, i) =>
			window.setTimeout(
				() => {
					push(v);
					if (i === example.terms.length - 1) setPlaying(null);
				},
				(i + 1) * FEED_MS,
			),
		);
	};

	const tally = useMemo(
		() => (crowd && version >= 0 ? read(crowd, terms) : null),
		[crowd, version, terms],
	);
	const hasData = terms.length > 0;
	const squares: { slot: Slot; title: string; note: string }[] = [
		{
			slot: 0,
			title: "Every program",
			note: tally ? `${count(tally.considered)} run` : "",
		},
		{
			slot: 1,
			title: "Only the ones that fit",
			note: tally ? `${count(tally.fitting)} rules fit` : "",
		},
	];

	return (
		<div className="ep" data-big={big}>
			<p className="ep-caption">
				{tally
					? caption(tally)
					: `Writing down every program up to ${BUDGET} bits…`}
			</p>

			<Examples playing={playing} onExample={feed} />

			<Ledger
				terms={terms}
				guesses={guesses}
				next={tally?.votes[0] ?? null}
				draft={draft}
				onDraft={(d) => {
					stop();
					setDraft(d);
				}}
				onCommit={commit}
				onPop={pop}
			/>

			<Actions
				canAdd={draft !== "" && draft !== "-" && terms.length < MAX_TERMS}
				empty={terms.length === 0}
				onCommit={commit}
				onPop={pop}
				onClear={clear}
			/>

			<div className="ep-stage">
				{squares.map(({ slot, title, note }) => (
					<section
						key={slot}
						className="ep-panel"
						data-slot={slot}
						data-role={slot === big ? "big" : "inset"}
						aria-label={title}
					>
						<h2 className="ep-panel__head">
							<span className="ep-panel__title">{title}</span>
							<span className="ep-panel__note">{note}</span>
						</h2>
						<div
							className="ep-panel__square"
							onPointerDownCapture={(e) => {
								if (!phone || slot === big) return;

								e.stopPropagation();
								setBig(slot);
								setFocus(null);
							}}
						>
							<Square
								crowd={crowd}
								slot={slot}
								version={version}
								hasData={hasData}
								focus={focus}
								reduced={reduced}
								name={
									slot === 0
										? "Every program as a tile sized by its vote, colored by the next number it predicts."
										: "The programs that fit your numbers, resized to share the whole square."
								}
								onPick={setFocus}
							/>
							<span className="ep-panel__tag" aria-hidden="true">
								{title}
							</span>
						</div>
					</section>
				))}

				<div className="ep-foot ep-foot--map">
					<Readout focus={focus} hint={hintFor(terms, phone)} />
					<Key />
				</div>

				<div className="ep-foot ep-foot--fit">
					<Bet tally={tally} />
					<Counts tally={tally} />
				</div>
			</div>

			{error ? (
				<p className="ep-error">
					This needs WebAssembly, which this browser did not load.
				</p>
			) : null}
		</div>
	);
}
