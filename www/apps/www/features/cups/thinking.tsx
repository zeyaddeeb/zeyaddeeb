"use client";

import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { ReservedText } from "@/components/reserved-text";
import {
	active,
	belief,
	pieces,
	type Recording,
	settled,
	type Thought,
	WAITS,
	words,
	written,
} from "./reasoner";
import type { Action } from "./server/input";
import type { Source, Trouble } from "./use-reasoner";

const MODEL = "Qwen3.5-4B";

interface ThinkingProps {
	thought: Thought;
	source: Source;
	trouble: Trouble;
	recorded: readonly Recording[];
	truth: number;
	swaps: number;
	onAsk: () => void;
	onAct: (action: Action) => void;
	onReplay: (recording: Recording) => void;
}

const STATUS = [
	`${MODEL} has 4 billion numbers and thinks in words before it answers. Ask it where the ball is.`,
	"Recorded run. Out of thinking budget after 9,999 words. It wrote position 5 as its answer, wrong. Cut off mid-thought, it says position 5, wrong.",
	"Recorded run. Done after 9,999 words. It says position 5, wrong. Its answer stopped changing at word 9,999.",
	"The live model is off right now. Watch a recorded run of the same model:",
];

function line(
	t: Thought,
	source: Source,
	trouble: Trouble,
	truth: number,
	swaps: number,
) {
	const said = status(t, source, trouble, truth, swaps);

	return source === "recorded" ? `Recorded run. ${said}` : said;
}

function status(
	t: Thought,
	source: Source,
	trouble: Trouble,
	truth: number,
	swaps: number,
) {
	const said = belief(t);
	const n = words(t.text).toLocaleString("en-US");
	const verdict = said
		? `position ${said.pick + 1}, ${said.pick === truth ? "right" : "wrong"}`
		: "nothing yet";
	const wrote = written(t.text);
	const note =
		wrote === null
			? ""
			: ` It wrote position ${wrote + 1} as its answer, ${wrote === truth ? "right" : "wrong"}.`;
	const from = settled(t, truth);
	const sure =
		from !== null && said?.pick === truth
			? ` Its answer stopped changing at word ${words(t.text.slice(0, from)).toLocaleString("en-US")}.`
			: "";

	if (source === "none") {
		if (trouble === "off")
			return "The live model is off right now. Watch a recorded run of the same model:";
		if (trouble === "busy")
			return "Every seat is taken right now. Watch a recorded run of the same model:";
		if (trouble === "down")
			return "The live model is not answering. Watch a recorded run of the same model:";
		if (swaps === 0) return "Swap some cups first, then ask the big one.";

		return STATUS[0] ?? "";
	}

	if (source === "asking") return "Asking…";

	switch (t.meter.phase) {
		case "queued":
			return `In line, ${t.meter.ahead} ahead.`;
		case "thinking":
			return `Thinking, ${n} words so far. Answer now: ${verdict}.`;
		case "finished":
			return `Done after ${n} words. It says ${verdict}.${sure}`;
		case "answered":
			return `Stopped after ${n} words.${note} Made to answer now, it says ${verdict}.`;
		case "spent":
			return `Out of thinking budget after ${n} words.${note} Cut off mid-thought, it says ${verdict}.`;
		case "failed":
			return "The model stopped answering. Try again in a minute.";
	}
}

export function Thinking({
	thought,
	source,
	trouble,
	recorded,
	truth,
	swaps,
	onAsk,
	onAct,
	onReplay,
}: ThinkingProps) {
	const box = useRef<HTMLDivElement>(null);
	const pinned = useRef(true);
	const phase = thought.meter.phase;
	const running = source !== "none" && active(phase);
	const forgeable = source === "live" && phase !== "failed";
	const parts = useMemo(() => pieces(thought.text), [thought.text]);
	const length = Math.max(1, thought.text.length);

	useEffect(() => {
		const el = box.current;

		if (el && pinned.current && thought.text) el.scrollTop = el.scrollHeight;
	}, [thought.text]);

	const offer = source === "none" && trouble !== null && recorded.length > 0;

	return (
		<section className="sw-think" aria-label={`${MODEL} thinking`}>
			<p className="sw-think__status" aria-live="polite">
				<ReservedText
					text={line(thought, source, trouble, truth, swaps)}
					samples={STATUS}
				/>
			</p>

			<div
				ref={box}
				className="sw-think__text"
				data-source={source}
				onScroll={(e) => {
					const el = e.currentTarget;

					pinned.current =
						el.scrollHeight - el.scrollTop - el.clientHeight < 24;
				}}
			>
				{offer ? (
					<span className="sw-think__offers">
						{recorded.map((r) => (
							<button
								key={`${r.start}:${r.swaps.join(",")}`}
								type="button"
								className="sw-button"
								onClick={() => onReplay(r)}
							>
								{r.swaps.length} swaps
							</button>
						))}
					</span>
				) : null}
				{source === "none" && !offer ? (
					<span className="sw-think__idle">
						Its thinking will appear here as it writes it. Every cup number it
						writes can be tapped and changed, to see whether it notices.
					</span>
				) : null}
				{parts.map((part) =>
					part.digit && forgeable ? (
						<button
							key={part.at}
							type="button"
							className="sw-think__digit"
							aria-label={`It wrote ${part.text}. Change it.`}
							onClick={() =>
								onAct({
									action: "forge",
									at: part.at,
									cup: (Number(part.text) % 5) + 1,
								})
							}
						>
							{part.text}
						</button>
					) : (
						<span key={part.at} data-digit={part.digit || undefined}>
							{part.text}
						</span>
					),
				)}
				{running ? (
					<span className="sw-think__caret" aria-hidden="true" />
				) : null}
			</div>

			<div className="sw-think__strip" aria-hidden="true">
				<span className="sw-think__legend">
					odds on the right cup, after each line
				</span>
				{thought.probes.map((probe) => (
					<span
						key={probe.at}
						className="sw-think__tick"
						data-right={(probe.p[truth] ?? 0) >= 0.5 || undefined}
						style={
							{
								left: `${(probe.at / length) * 100}%`,
								"--p": probe.p[truth] ?? 0,
							} as CSSProperties
						}
					/>
				))}
			</div>

			<div className="sw-think__controls">
				<button
					type="button"
					className="sw-button sw-button--go"
					disabled={swaps === 0 || running || source === "asking"}
					onClick={onAsk}
				>
					{source === "none" ? "Ask it" : "Ask again"}
				</button>
				<button
					type="button"
					className="sw-button"
					disabled={!running}
					onClick={() => onAct({ action: "answer" })}
				>
					Answer now
				</button>
				<button
					type="button"
					className="sw-button"
					disabled={
						source !== "live" ||
						running ||
						phase === "failed" ||
						thought.meter.waits >= WAITS
					}
					onClick={() => onAct({ action: "wait" })}
				>
					Wait
				</button>
			</div>
		</section>
	);
}
