"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { number } from "./formula";
import { EXAMPLES, MAX_TERMS, short, type Vote } from "./model";

const CLEAN = /^-?\d{0,13}$/;
const CELLS = Array.from({ length: MAX_TERMS }, (_, i) => i);

interface Slot {
	x: number;
	y: number;
	w: number;
	h: number;
	pitch: number;
}

const cell = (el: HTMLElement, i: number) =>
	el.querySelector<HTMLElement>(`[data-cell="${i}"]`);

function measure(el: HTMLElement): Slot | null {
	const first = cell(el, 0);
	const second = cell(el, 1);
	const box = first?.firstElementChild as HTMLElement | null;

	if (!first || !second || !box) return null;

	return {
		x: first.offsetLeft,
		y: first.offsetTop,
		w: first.offsetWidth,
		h: box.offsetHeight,
		pitch: second.offsetLeft - first.offsetLeft,
	};
}

export function Ledger({
	terms,
	guesses,
	next,
	draft,
	onDraft,
	onCommit,
	onPop,
}: {
	terms: number[];
	guesses: (Vote | null)[];
	next: Vote | null;
	draft: string;
	onDraft: (draft: string) => void;
	onCommit: () => void;
	onPop: () => void;
}) {
	const row = useRef<HTMLDivElement>(null);
	const [slot, setSlot] = useState<Slot | null>(null);
	const at = terms.length;
	const full = at >= MAX_TERMS;

	useLayoutEffect(() => {
		const el = row.current;

		if (!el) return;

		const update = () => setSlot(measure(el));
		const ro = new ResizeObserver(update);

		update();
		ro.observe(el);

		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const el = row.current;

		if (!el || !slot) return;

		const room = Math.floor((el.clientWidth - slot.x) / slot.pitch);
		const target = cell(
			el,
			Math.max(0, Math.min(at, MAX_TERMS - 1) + 2 - room),
		);
		const first = cell(el, 0);

		if (target && first)
			el.scrollTo({ left: target.offsetLeft - first.offsetLeft });
	}, [at, slot]);

	return (
		<div className="ep-ledger" ref={row} data-typing={draft !== ""}>
			<span className="ep-ledger__head">You</span>
			<span className="ep-ledger__head ep-ledger__head--guess">It guessed</span>
			{CELLS.map((i) => {
				const value = terms[i];
				const guess = guesses[i] ?? null;
				const state =
					value !== undefined ? "done" : i === at ? "next" : "empty";

				return (
					<div
						key={i}
						className="ep-ledger__cell"
						data-cell={i}
						data-state={state}
					>
						<span className="ep-ledger__value">
							{value !== undefined
								? number(value)
								: i === at && next
									? number(next.value)
									: ""}
						</span>
						<span
							className="ep-ledger__guess"
							data-hit={
								guess !== null && value !== undefined && guess.value === value
							}
						>
							{value !== undefined && guess
								? number(guess.value)
								: i === at && next
									? short(next.share)
									: ""}
						</span>
					</div>
				);
			})}
			<input
				className="ep-ledger__input"
				type="text"
				inputMode="numeric"
				enterKeyHint="done"
				autoComplete="off"
				aria-label={at === 0 ? "First number" : "Next number"}
				value={draft}
				disabled={full}
				data-ready={slot !== null && !full}
				style={
					slot
						? {
								left: slot.x,
								top: slot.y,
								width: slot.w,
								height: slot.h,
								transform: `translateX(${Math.min(at, MAX_TERMS - 1) * slot.pitch}px)`,
							}
						: undefined
				}
				onChange={(e) => {
					const clean = e.target.value.replace("−", "-").replace(/\s|,/g, "");

					if (CLEAN.test(clean)) onDraft(clean);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " " || e.key === ",") {
						e.preventDefault();
						onCommit();
					}

					if (e.key === "Backspace" && draft === "") {
						e.preventDefault();
						onPop();
					}
				}}
			/>
		</div>
	);
}

export function Actions({
	canAdd,
	empty,
	onCommit,
	onPop,
	onClear,
}: {
	canAdd: boolean;
	empty: boolean;
	onCommit: () => void;
	onPop: () => void;
	onClear: () => void;
}) {
	return (
		<div className="ep-entry">
			<button
				type="button"
				className="ep-button ep-button--solid"
				onClick={onCommit}
				disabled={!canAdd}
			>
				Add
			</button>
			<button
				type="button"
				className="ep-button"
				onClick={onPop}
				disabled={empty}
			>
				Undo
			</button>
			<button
				type="button"
				className="ep-button"
				onClick={onClear}
				disabled={empty}
			>
				Clear
			</button>
		</div>
	);
}

export function Examples({
	playing,
	onExample,
}: {
	playing: string | null;
	onExample: (id: string) => void;
}) {
	return (
		<div className="ep-examples">
			<span className="ep-examples__label">Try</span>
			{EXAMPLES.map((ex) => (
				<button
					key={ex.id}
					type="button"
					className="ep-chip"
					data-on={playing === ex.id}
					onClick={() => onExample(ex.id)}
				>
					{ex.label}
				</button>
			))}
		</div>
	);
}
