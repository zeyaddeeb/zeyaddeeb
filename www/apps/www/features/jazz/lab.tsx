"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CallBoard } from "./calls";
import { Chart } from "./chart";
import { Clock, type Selection } from "./clock";
import { tokenize } from "./code-line";
import { Crate } from "./crate";
import { pitch, shiftChord, shiftNote } from "./music";
import type { Node } from "./pattern";
import {
	type CompiledScore,
	compileAll,
	type LaneId,
	laneIds,
	type Problem,
	replaceSpan,
	type Score,
} from "./score";
import { Band } from "./synth";
import { Transport } from "./transport";
import {
	arrange,
	type CallId,
	type Calls,
	call,
	caption,
	chorus,
	opening,
	type RecordId,
	welcome,
} from "./tune";
import "./jazz.css";

export function JazzLab() {
	const [state, setState] = useState<Calls>(opening);
	const [edits, setEdits] = useState<Partial<Record<LaneId, string>>>({});
	const [changed, setChanged] = useState<string[]>([]);
	const [said, setSaid] = useState(welcome);
	const [pending, setPending] = useState<{
		id: CallId | null;
		at: number;
	} | null>(null);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [playing, setPlaying] = useState(false);
	const [record, setRecord] = useState<{ id: RecordId; n: number } | null>(
		null,
	);
	const [silence, setSilence] = useState(0);
	const band = useRef<Band | null>(null);
	const transport = useRef<Transport | null>(null);
	const arm = useRef<SVGGElement>(null);
	const count = useRef<HTMLSpanElement>(null);
	const root = useRef<HTMLDivElement>(null);
	const good = useRef<Partial<Record<LaneId, Node | null>>>({});
	const lastCall = useRef<CallId | null>(null);

	const score = useMemo<Score>(() => {
		const base = arrange(state);
		return { ...base, code: { ...base.code, ...edits } };
	}, [state, edits]);

	const raw = useMemo(() => compileAll(score), [score]);
	const compiled = useMemo(() => {
		const out = {} as CompiledScore;
		for (const lane of laneIds) {
			const entry = raw[lane];
			if (entry.problem)
				out[lane] = { node: good.current[lane] ?? null, problem: null };
			else {
				good.current[lane] = entry.node;
				out[lane] = entry;
			}
		}
		return out;
	}, [raw]);

	const problems = useMemo(
		() =>
			Object.fromEntries(laneIds.map((l) => [l, raw[l].problem])) as Record<
				LaneId,
				Problem | null
			>,
		[raw],
	);

	useEffect(() => {
		const t = transport.current;
		if (!t) return;
		const at = t.queue(score, compiled);
		setPending(at === null ? null : { id: lastCall.current, at });
		lastCall.current = null;
	}, [score, compiled]);

	const latest = useRef({ score, compiled });
	latest.current = { score, compiled };

	const stop = useCallback(() => {
		transport.current?.stop();
		setPlaying(false);
		setPending(null);
	}, []);

	const start = useCallback(async () => {
		if (!band.current) {
			band.current = new Band();
			transport.current = new Transport(
				band.current,
				chorus,
				latest.current.score,
			);
		}
		await band.current.resume();
		const t = transport.current;
		if (!t) return;
		t.queue(latest.current.score, latest.current.compiled);
		t.warm();
		t.start(true);
		setSilence((n) => n + 1);
		setPlaying(true);
	}, []);

	useEffect(() => () => band.current?.close(), []);

	useEffect(() => {
		const el = root.current;
		if (!playing || !el) return;
		let frame = 0;
		const loop = () => {
			frame = requestAnimationFrame(loop);
			const pos = transport.current?.position();
			if (!pos) return;
			const counting = pos.bar < 0;
			const t = counting ? 0 : pos.bar + pos.beat / 4;
			arm.current?.setAttribute(
				"transform",
				`rotate(${(t / chorus) * 360} 500 500)`,
			);
			if (count.current)
				count.current.textContent = counting
					? String(Math.floor(pos.beat) + 1)
					: "";
			setPending((p) => (p && pos.clock >= p.at ? null : p));
			const on = new Set<string>();
			for (const note of el.querySelectorAll<SVGGElement>(
				".jz-dial [data-t0]",
			)) {
				const active =
					!counting &&
					t >= Number(note.dataset.t0) &&
					t < Number(note.dataset.t1);
				if (active) on.add(note.dataset.token ?? "");
				if (active !== note.hasAttribute("data-on"))
					note.toggleAttribute("data-on", active);
			}
			for (const token of el.querySelectorAll<HTMLElement>(
				".jz-code-mirror [data-token]",
			)) {
				const active = on.has(token.dataset.token ?? "");
				if (active !== token.hasAttribute("data-on"))
					token.toggleAttribute("data-on", active);
			}
			for (const sector of el.querySelectorAll<SVGGElement>("[data-bar]")) {
				const active = !counting && Number(sector.dataset.bar) === pos.bar;
				if (active !== sector.hasAttribute("data-on"))
					sector.toggleAttribute("data-on", active);
			}
			for (const field of el.querySelectorAll<HTMLElement>(".jz-code-field")) {
				const input = field.querySelector("input");
				const token = field.querySelector<HTMLElement>(
					".jz-code-mirror [data-on]",
				);
				if (!input || !token || document.activeElement === input) continue;
				const view = input.clientWidth;
				const left = token.offsetLeft;
				if (
					left < input.scrollLeft ||
					left + token.offsetWidth > input.scrollLeft + view - 16
				)
					input.scrollLeft = Math.max(0, left - view * 0.2);
			}
		};
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			for (const node of el.querySelectorAll("[data-on]"))
				node.removeAttribute("data-on");
			arm.current?.setAttribute("transform", "rotate(0 500 500)");
			if (count.current) count.current.textContent = "";
		};
	}, [playing]);

	const onCall = (id: CallId) => {
		const next = call(state, id);
		const before = arrange(state);
		const after = arrange(next);
		const lanes = laneIds.filter((l) => before.code[l] !== after.code[l]);
		lastCall.current = id;
		setState(next);
		setEdits((e) =>
			Object.fromEntries(
				Object.entries(e).filter(([l]) => !lanes.includes(l as LaneId)),
			),
		);
		setChanged([
			...lanes,
			...(before.tempo !== after.tempo ? ["tempo"] : []),
			...(before.swing !== after.swing ? ["swing"] : []),
		]);
		setSaid(caption(next, id));
		setSelection(null);
	};

	const edit = useCallback(
		(by: number | "rest") => {
			if (!selection) return;
			const code = score.code[selection.lane];
			const token = tokenize(code).find(
				(t) => t.word && t.start === selection.start,
			);
			if (!token) return;
			const next =
				by === "rest"
					? "~"
					: selection.lane === "chords"
						? shiftChord(token.text, by)
						: selection.lane === "piano" || selection.lane === "banjo"
							? null
							: shiftNote(token.text, by);
			if (!next) return;
			setEdits((e) => ({
				...e,
				[selection.lane]: replaceSpan(
					code,
					[token.start, token.start + token.text.length],
					next,
				),
			}));
			setChanged([selection.lane]);
			if (by === "rest") setSelection(null);
		},
		[selection, score.code],
	);

	useEffect(() => {
		if (!selection) return;
		const key = (event: KeyboardEvent) => {
			if ((event.target as HTMLElement | null)?.closest("input, textarea"))
				return;
			if (event.key === "ArrowUp") edit(event.shiftKey ? 12 : 1);
			else if (event.key === "ArrowDown") edit(event.shiftKey ? -12 : -1);
			else if (event.key === "Escape") setSelection(null);
			else return;
			event.preventDefault();
		};
		window.addEventListener("keydown", key);
		return () => window.removeEventListener("keydown", key);
	}, [selection, edit]);

	const problem = laneIds
		.map((l) => [l, raw[l].problem] as const)
		.find(([, p]) => p);
	const token = selection
		? tokenize(score.code[selection.lane]).find(
				(t) => t.word && t.start === selection.start,
			)
		: null;

	const readout = problem ? (
		<p className="jz-readout-line" data-tone="problem">
			<b>{problem[0]}</b> {problem[1]?.message} The band keeps playing the last
			version that worked.
		</p>
	) : selection && token ? (
		<div className="jz-readout-line" data-tone="selected">
			<p>
				<b>{selection.lane}</b> <code>{token.text}</code>{" "}
				{describe(selection.lane, token.text)}
			</p>
			<div className="jz-readout-tools">
				{selection.lane === "piano" || selection.lane === "banjo" ? null : (
					<>
						<button
							type="button"
							onClick={() => edit(1)}
							aria-label="Up a half step"
						>
							▲
						</button>
						<button
							type="button"
							onClick={() => edit(-1)}
							aria-label="Down a half step"
						>
							▼
						</button>
					</>
				)}
				<button type="button" onClick={() => edit("rest")}>
					Rest
				</button>
				<button type="button" onClick={() => setSelection(null)}>
					Done
				</button>
			</div>
		</div>
	) : (
		<p className="jz-readout-line">
			Tap a shape on the clock or a word below to change one note. Type in any
			line to rewrite it.
		</p>
	);

	return (
		<div className="jz" ref={root} data-playing={playing || undefined}>
			<div className="jz-stage">
				<div className="jz-clock">
					<Clock
						compiled={compiled}
						ratio={score.swing}
						selection={selection}
						arm={arm}
						onSelect={setSelection}
					/>
					<button
						type="button"
						className="jz-start"
						aria-pressed={playing}
						aria-label={playing ? "Stop the band" : "Count the band in"}
						onClick={() => (playing ? stop() : start())}
					>
						<span ref={count} className="jz-count" aria-hidden="true" />
						<svg
							viewBox="0 0 12 12"
							aria-hidden="true"
							className="jz-start-icon"
						>
							{playing ? (
								<rect x="2" y="2" width="8" height="8" />
							) : (
								<polygon points="3,1.5 11,6 3,10.5" />
							)}
						</svg>
						<span className="jz-start-label">
							{playing ? "Stop" : "Count in"}
						</span>
					</button>
				</div>
				<div className="jz-panel">
					<CallBoard
						state={state}
						caption={said}
						pending={pending?.id ?? null}
						onCall={onCall}
						onRecord={(id) => {
							stop();
							setRecord((r) => ({ id, n: (r?.n ?? 0) + 1 }));
						}}
					/>
					<Chart
						score={score}
						problems={problems}
						changed={changed}
						selection={selection}
						readout={readout}
						edited={Object.keys(edits).length > 0 || state !== opening}
						onCode={(lane, code) => {
							setEdits((e) => ({ ...e, [lane]: code }));
							setChanged([lane]);
						}}
						onSelect={setSelection}
						onReset={() => {
							setState(opening);
							setEdits({});
							setChanged([]);
							setSaid(welcome);
							setSelection(null);
						}}
					/>
				</div>
			</div>
			<Crate
				request={record}
				silence={silence}
				onPlaying={(on) => {
					if (on) stop();
				}}
			/>
		</div>
	);
}

function describe(lane: LaneId, word: string) {
	if (lane === "chords") return "a chord";
	if (word === "x") return lane === "banjo" ? "a strum" : "a chord";
	if (/^[135]$/.test(word)) return `bass note ${word} of the chord`;
	const p = pitch(word);
	if (!p) return "";
	return p.to === null
		? "▲ and ▼ move it a half step"
		: "a slide; ▲ and ▼ move both ends";
}
