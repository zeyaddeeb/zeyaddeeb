"use client";

import {
	type CSSProperties,
	Fragment,
	useEffect,
	useMemo,
	useState,
} from "react";
import { CodeLine } from "./code-line";
import { Glyph } from "./glyph";
import { pitch, ratioLabel, shiftChord, shiftNote } from "./music";
import { parse } from "./pattern";
import {
	type CompiledScore,
	compile,
	type LaneId,
	laneIds,
	type Problem,
	type Score,
} from "./score";
import {
	barsOf,
	chordChoices,
	chorus,
	formatBar,
	type Item,
	itemsOf,
	rhythms,
	serialize,
	ticks,
} from "./tune";
import { useSmall } from "./use-small";

export interface Focus {
	lane: LaneId;
	bar: number;
	at: number | null;
}

interface ChartProps {
	score: Score;
	compiled: CompiledScore;
	problems: Record<LaneId, Problem | null>;
	changed: string[];
	focus: Focus | null;
	edited: boolean;
	onFocus: (focus: Focus | null) => void;
	onCode: (lane: LaneId, code: string) => void;
	onReset: () => void;
}

const melodic = (lane: LaneId) =>
	lane !== "chords" && lane !== "piano" && lane !== "banjo";

const bars = Array.from({ length: chorus }, (_, b) => b);

export function Chart({
	score,
	compiled,
	problems,
	changed,
	focus,
	edited,
	onFocus,
	onCode,
	onReset,
}: ChartProps) {
	const grid = useMemo(() => {
		const out = {} as Record<LaneId, Item[][]>;

		for (const lane of laneIds)
			out[lane] = bars.map((b) => itemsOf(compiled[lane].node, b));

		return out;
	}, [compiled]);

	const ranges = useMemo(() => {
		const out = {} as Record<LaneId, [number, number]>;

		for (const lane of laneIds) {
			const keys = grid[lane].flat().flatMap((i) => {
				const p = pitch(i.text);

				return p ? [p.from, ...(p.to === null ? [] : [p.to])] : [];
			});

			const lo = keys.length ? Math.min(...keys) : 60;
			const hi = keys.length ? Math.max(...keys) : 72;

			out[lane] = hi - lo < 8 ? [lo - 4, hi + 4] : [lo, hi];
		}

		return out;
	}, [grid]);

	const writeBar = (lane: LaneId, bar: number, text: string) => {
		const next = barsOf(compiled[lane].node);

		next[bar] = text;
		onCode(lane, serialize(next));
	};

	const small = useSmall();

	const systems = small
		? [bars.slice(0, 4), bars.slice(4, 8), bars.slice(8)]
		: [bars];

	return (
		<section className="jz-chart" aria-label="The band’s chart">
			<header className="jz-chart-head">
				<p className="jz-chart-meta">
					<span data-changed={changed.includes("tempo") || undefined}>
						tempo {score.tempo}
					</span>
					<span data-changed={changed.includes("swing") || undefined}>
						swing {ratioLabel(score.swing)}
					</span>
				</p>
				<button
					type="button"
					className="jz-link"
					onClick={onReset}
					disabled={!edited}
				>
					Start over
				</button>
			</header>
			{systems.map((system) => (
				<Fragment key={system[0]}>
					<div
						className="jz-score"
						style={{ "--bars": system.length } as CSSProperties}
					>
						<div className="jz-row jz-row-numbers" aria-hidden="true">
							<span className="jz-row-name" />
							<div className="jz-cells">
								{system.map((b) => (
									<span key={b} className="jz-bar-number" data-bar={b}>
										{b + 1}
									</span>
								))}
							</div>
						</div>
						{laneIds.map((lane) => (
							<div
								key={lane}
								className="jz-row"
								data-lane={lane}
								data-changed={changed.includes(lane) || undefined}
								data-bad={problems[lane] ? true : undefined}
							>
								<span className="jz-row-name">
									<Glyph lane={lane} size={10} />
									<span>{lane}</span>
								</span>
								<div className="jz-cells">
									{system.map((b) => (
										<button
											key={b}
											type="button"
											className="jz-cell"
											data-bar={b}
											aria-pressed={focus?.lane === lane && focus.bar === b}
											aria-label={`${lane}, bar ${b + 1}`}
											onClick={() =>
												onFocus(
													focus?.lane === lane && focus.bar === b
														? null
														: {
																lane,
																bar: b,
																at:
																	grid[lane][b].find((i) => i.text !== "~")
																		?.begin ?? 0,
															},
												)
											}
										>
											<Cell
												lane={lane}
												items={grid[lane][b]}
												range={ranges[lane]}
											/>
										</button>
									))}
								</div>
							</div>
						))}
					</div>
					{focus && system.includes(focus.bar) ? (
						<BarEditor
							key={`${focus.lane}:${focus.bar}`}
							focus={focus}
							items={grid[focus.lane][focus.bar]}
							code={score.code[focus.lane]}
							problem={problems[focus.lane]}
							onFocus={onFocus}
							onBar={(text) => writeBar(focus.lane, focus.bar, text)}
							onEvery={(text) => onCode(focus.lane, text)}
							onCode={(code) => onCode(focus.lane, code)}
						/>
					) : null}
				</Fragment>
			))}
			{focus ? null : (
				<p className="jz-chart-hint">
					{laneIds.find((l) => problems[l])
						? "One line has a mistake. The band keeps playing the last version that worked."
						: "Tap any bar to change it, or tap a shape on the clock."}
				</p>
			)}
		</section>
	);
}

function Cell({
	lane,
	items,
	range: [lo, hi],
}: {
	lane: LaneId;
	items: Item[];
	range: [number, number];
}) {
	const sounding = items.filter((i) => i.text !== "~");

	if (lane === "chords")
		return (
			<span className="jz-cell-chord">
				{sounding.map((i) => i.text).join(" ")}
			</span>
		);

	const y = (key: number) => 21 - ((key - lo) / Math.max(1, hi - lo)) * 18;

	return (
		<svg
			viewBox={`0 0 ${ticks} 24`}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{sounding.map((i) => {
				if (!melodic(lane)) {
					const bass = /^[135]$/.test(i.text);

					return (
						<line
							key={i.begin}
							x1={i.begin + 1.5}
							x2={i.begin + 1.5}
							y1={bass ? 14 : 4}
							y2={20}
						/>
					);
				}

				const p = pitch(i.text);

				if (!p) return null;

				const y0 = y(p.from);
				const y1 = p.to === null ? y0 : y(p.to);

				return (
					<polygon
						key={i.begin}
						points={`${i.begin},${y0 - 1.5} ${i.begin + Math.max(1.5, i.size - 1)},${y1 - 1.5} ${i.begin + Math.max(1.5, i.size - 1)},${y1 + 1.5} ${i.begin},${y0 + 1.5}`}
					/>
				);
			})}
		</svg>
	);
}

interface BarEditorProps {
	focus: Focus;
	items: Item[];
	code: string;
	problem: Problem | null;
	onFocus: (focus: Focus | null) => void;
	onBar: (text: string) => void;
	onEvery: (code: string) => void;
	onCode: (code: string) => void;
}

function BarEditor({
	focus,
	items,
	code,
	problem,
	onFocus,
	onBar,
	onEvery,
	onCode,
}: BarEditorProps) {
	const { lane, bar } = focus;
	const current = formatBar(items);
	const [draft, setDraft] = useState(current);
	const [wrong, setWrong] = useState<string | null>(null);

	useEffect(() => {
		setDraft(current);
		setWrong(null);
	}, [current]);

	const picked = items.find((i) => i.begin === focus.at) ?? null;

	const replace = (text: string) => {
		if (!picked) return;

		onBar(formatBar(items.map((i) => (i === picked ? { ...i, text } : i))));
	};

	const nudge = (by: number) => {
		if (!picked || picked.text === "~") return;

		const next =
			lane === "chords"
				? shiftChord(picked.text, by)
				: shiftNote(picked.text, by);

		if (next) replace(next);
	};

	useEffect(() => {
		if (!melodic(lane) && lane !== "chords") return;

		const key = (event: KeyboardEvent) => {
			if ((event.target as HTMLElement | null)?.closest("input, textarea"))
				return;

			if (event.key === "ArrowUp") nudge(event.shiftKey ? 12 : 1);
			else if (event.key === "ArrowDown") nudge(event.shiftKey ? -12 : -1);
			else if (event.key === "Escape") onFocus(null);
			else return;

			event.preventDefault();
		};

		window.addEventListener("keydown", key);

		return () => window.removeEventListener("keydown", key);
	});

	const neighbor =
		[...items]
			.reverse()
			.find((i) => i.text !== "~" && picked && i.begin < picked.begin)?.text ??
		items.find((i) => i.text !== "~")?.text ??
		{ you: "bb4", cornet: "bb4", clarinet: "d5", trombone: "bb2" }[
			lane as "you" | "cornet" | "clarinet" | "trombone"
		] ??
		"bb4";

	const type = (text: string) => {
		setDraft(text);

		const bars = code.trim() ? barsFrom(code) : null;

		if (!bars) return;

		bars[bar] = text.trim() || "~";

		const candidate = serialize(bars);
		const result = compile(lane, candidate);

		if (result.problem) setWrong(result.problem.message);
		else {
			setWrong(null);
			onCode(candidate);
		}
	};

	return (
		<div className="jz-editor" data-lane={lane}>
			<div className="jz-editor-head">
				<p>
					<Glyph lane={lane} size={10} />
					<b>{lane}</b> bar {bar + 1}
				</p>
				<div className="jz-editor-steps">
					<button
						type="button"
						aria-label="Previous bar"
						onClick={() =>
							onFocus({ lane, bar: (bar + chorus - 1) % chorus, at: null })
						}
					>
						←
					</button>
					<button
						type="button"
						aria-label="Next bar"
						onClick={() => onFocus({ lane, bar: (bar + 1) % chorus, at: null })}
					>
						→
					</button>
					<button type="button" onClick={() => onFocus(null)}>
						Done
					</button>
				</div>
			</div>
			<div className="jz-chips">
				{items.map((i) => (
					<button
						key={i.begin}
						type="button"
						className="jz-chip"
						data-rest={i.text === "~" || undefined}
						aria-pressed={
							lane === "piano" || lane === "banjo" ? undefined : picked === i
						}
						style={{ flexGrow: i.size }}
						onClick={() => onFocus({ lane, bar, at: i.begin })}
					>
						{i.text === "~" ? "rest" : i.text}
					</button>
				))}
			</div>
			{lane === "chords" ? (
				<div className="jz-choices">
					{chordChoices.map((c) => (
						<button
							key={c}
							type="button"
							aria-pressed={picked?.text === c}
							onClick={() => replace(c)}
						>
							{c}
						</button>
					))}
				</div>
			) : lane === "piano" || lane === "banjo" ? (
				<div className="jz-choices" data-wide="">
					{rhythms[lane].map((r) => {
						const text = formatBar(itemsOf(parse(r.code), 0));

						return (
							<button
								key={r.code}
								type="button"
								aria-pressed={current === text}
								onClick={() => onBar(text)}
							>
								<b>{r.name}</b>
								<code>{r.code}</code>
							</button>
						);
					})}
				</div>
			) : (
				<div className="jz-choices" data-tools="">
					<button
						type="button"
						disabled={!picked || picked.text === "~"}
						onClick={() => nudge(1)}
						aria-label="Up a half step"
					>
						▲
					</button>
					<button
						type="button"
						disabled={!picked || picked.text === "~"}
						onClick={() => nudge(-1)}
						aria-label="Down a half step"
					>
						▼
					</button>
					<button
						type="button"
						disabled={!picked}
						onClick={() => replace(picked?.text === "~" ? neighbor : "~")}
					>
						{picked?.text === "~" ? "Note" : "Rest"}
					</button>
				</div>
			)}
			<div className="jz-editor-code">
				<label>
					<span className="jz-eyebrow">This bar</span>
					<input
						value={draft}
						spellCheck={false}
						autoCapitalize="off"
						autoCorrect="off"
						autoComplete="off"
						data-bad={wrong ? true : undefined}
						onChange={(event) => type(event.currentTarget.value)}
					/>
				</label>
				<button
					type="button"
					className="jz-link"
					onClick={() => onEvery(current)}
				>
					Use in every bar
				</button>
			</div>
			<p className="jz-editor-problem">{wrong ?? problem?.message ?? ""}</p>
			<div className="jz-editor-line">
				<span className="jz-eyebrow">Whole line</span>
				<CodeLine
					lane={lane}
					code={code}
					problem={problem}
					muted={false}
					selected={null}
					onChange={onCode}
					onCaret={() => {}}
				/>
			</div>
		</div>
	);
}

function barsFrom(code: string) {
	try {
		return barsOf(parse(code));
	} catch {
		return null;
	}
}
