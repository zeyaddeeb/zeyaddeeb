"use client";

import { useEffect, useRef } from "react";
import type { Belief, Note } from "./follow";
import { MOST, PAIRS } from "./task";

const COLUMNS = Array.from({ length: MOST }, (_, i) => i);

interface TapeProps {
	swaps: readonly number[];
	truth: readonly number[];
	notes: readonly Note[] | null;
	once: readonly Belief[] | null;
	locked: boolean;
	onForge: (i: number) => void;
}

export function Tape({
	swaps,
	truth,
	notes,
	once,
	locked,
	onForge,
}: TapeProps) {
	const scroller = useRef<HTMLDivElement>(null);
	const n = swaps.length;

	useEffect(() => {
		const el = scroller.current;

		if (!el) return;

		const column = el.scrollWidth / MOST;
		const want = Math.max(0, (n + 1) * column - el.clientWidth);

		if (n === 0) el.scrollLeft = 0;
		else if (el.scrollLeft < want || el.scrollLeft > n * column)
			el.scrollLeft = want;
	}, [n]);

	return (
		<div className="sw-tape">
			<div className="sw-tape__labels" aria-hidden="true">
				<span>Swap</span>
				<span data-row="ball">Ball</span>
				<span data-row="notes">Notes</span>
				<span data-row="once">At once</span>
			</div>
			<div className="sw-tape__scroll" ref={scroller}>
				<ol
					className="sw-tape__columns"
					aria-label="Every swap and what each machine said after it"
				>
					{COLUMNS.map((i) => {
						const pair = PAIRS[swaps[i] ?? -1];
						const ball = truth[i];
						const note = notes?.[i];
						const guess = once?.[i];

						if (!pair || ball === undefined)
							return (
								<li
									key={i}
									className="sw-col"
									data-empty={i === n ? "next" : true}
								/>
							);

						return (
							<li key={i} className="sw-col">
								<span className="sw-cell" data-row="swap">
									{pair[0] + 1}
									<span className="sw-cell__and" aria-hidden="true" />
									{pair[1] + 1}
								</span>
								<span className="sw-cell" data-row="ball">
									{ball + 1}
								</span>
								<button
									type="button"
									className="sw-cell sw-cell--note"
									data-row="notes"
									data-wrong={note && note.wrote !== ball ? true : undefined}
									data-forged={note?.forged || undefined}
									disabled={locked || !note}
									aria-label={`Note ${i + 1} says cup ${(note?.wrote ?? 0) + 1}. Change it.`}
									onClick={() => onForge(i)}
								>
									{note ? note.wrote + 1 : ""}
								</button>
								<span
									className="sw-cell"
									data-row="once"
									data-wrong={guess && guess.pick !== ball ? true : undefined}
								>
									{guess ? guess.pick + 1 : ""}
								</span>
							</li>
						);
					})}
				</ol>
			</div>
		</div>
	);
}
