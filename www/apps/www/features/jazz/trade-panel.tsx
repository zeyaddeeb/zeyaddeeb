"use client";

import { type RefObject, useState } from "react";
import { Glyph } from "./glyph";
import {
	type Answer,
	type Fragment,
	fragments,
	type PlayerId,
	players,
	slotsPerBar,
	stats,
} from "./model";
import { noteName } from "./music";

export const pad = [67, 70, 72, 73, 74, 75, 77, 79, 80, 82];
export const letters = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];

export interface Ledger {
	player: PlayerId;
	answer: Answer;
	heard: number[];
	bar: number;
	silent: boolean;
	opening: boolean;
	heardSpan: [number, number] | null;
}

const memories = [
	{
		value: 1,
		name: "Stitch",
		pieces: [3, 3, 3, 3, 3, 3],
		hint: "matches one note, joins scraps",
	},
	{ value: 3, name: "Mix", pieces: [7, 7, 8], hint: "matches three notes" },
	{
		value: 5,
		name: "Quote",
		pieces: [24],
		hint: "matches five notes, lifts whole phrases",
	},
];

function Seams({ pieces }: { pieces: number[] }) {
	let x = 0;
	return (
		<svg viewBox="0 0 24 8" aria-hidden="true" className="jz-seams">
			{pieces.map((w, k) => {
				const at = x;
				x += w + 1;
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed drawing
					<rect key={k} x={at} y="0" width={Math.min(w, 24 - at)} height="8" />
				);
			})}
		</svg>
	);
}

function MemoryControl({
	memory,
	onMemory,
}: {
	memory: number;
	onMemory: (memory: number) => void;
}) {
	return (
		<div className="jz-memory">
			<span className="jz-eyebrow">Memory</span>
			{memories.map((m) => (
				<button
					key={m.value}
					type="button"
					aria-pressed={memory === m.value}
					aria-label={`${m.name}: ${m.hint}`}
					title={`${m.name}: ${m.hint}`}
					onClick={() => onMemory(m.value)}
				>
					<Seams pieces={m.pieces} />
					{m.name}
				</button>
			))}
		</div>
	);
}

const counts = Object.fromEntries(players.map((p) => [p.id, stats(p.id)]));

interface HornProps {
	down: Set<number>;
	hum: "off" | "on" | "denied";
	turn: RefObject<HTMLDivElement | null>;
	voice: string;
	onDown: (key: number, id: string) => void;
	onUp: (id: string) => void;
	onHum: () => void;
}

export function Horn({
	down,
	hum,
	turn,
	voice,
	onDown,
	onUp,
	onHum,
}: HornProps) {
	return (
		<section className="jz-horn" aria-label="Your horn">
			<div className="jz-turn" ref={turn} data-lane={voice}>
				<span className="jz-turn-label">Your horn</span>
				<span className="jz-turn-track" aria-hidden="true">
					<i />
				</span>
				<button
					type="button"
					className="jz-hum"
					aria-pressed={hum === "on"}
					onClick={onHum}
				>
					<svg viewBox="0 0 12 12" aria-hidden="true">
						<rect x="4" y="1" width="4" height="7" rx="2" />
						<path d="M2.5 6a3.5 3.5 0 0 0 7 0M6 9.5V11" />
					</svg>
					<span>{hum === "denied" ? "No mic" : "Hum"}</span>
				</button>
			</div>
			<div className="jz-pad">
				{pad.map((key, k) => (
					<button
						key={key}
						type="button"
						className="jz-key"
						data-down={down.has(key) || undefined}
						aria-label={`Play ${noteName(key)}`}
						onPointerDown={(event) => {
							event.currentTarget.setPointerCapture(event.pointerId);
							onDown(key, `pointer:${event.pointerId}`);
						}}
						onPointerUp={(event) => onUp(`pointer:${event.pointerId}`)}
						onPointerCancel={(event) => onUp(`pointer:${event.pointerId}`)}
						onContextMenu={(event) => event.preventDefault()}
					>
						<span className="jz-key-letter">{letters[k]}</span>
						<span className="jz-key-note">{noteName(key)}</span>
					</button>
				))}
			</div>
		</section>
	);
}

interface PlayersProps {
	player: PlayerId;
	trading: boolean;
	onPlayer: (id: PlayerId) => void;
}

export function Players({ player, trading, onPlayer }: PlayersProps) {
	return (
		<div className="jz-players">
			{players.map((p) => (
				<button
					key={p.id}
					type="button"
					className="jz-player"
					data-lane={p.voice}
					aria-pressed={trading && player === p.id}
					onClick={() => onPlayer(p.id)}
				>
					<span className="jz-player-name">
						<Glyph lane={p.voice} size={11} />
						{p.short}
					</span>
					<small>{p.voice}</small>
				</button>
			))}
		</div>
	);
}

function clock(seconds: number) {
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function source(f: Fragment) {
	return f.line.who === "you"
		? `you, ${f.line.title}`
		: `${f.line.title}, ${f.line.year}, at ${clock(f.time)}`;
}

export function Provenance({
	ledger,
	player,
	memory,
	onMemory,
}: {
	ledger: Ledger | null;
	player: PlayerId;
	memory: number;
	onMemory: (memory: number) => void;
}) {
	const head = (
		<div className="jz-ledger-head">
			<p className="jz-eyebrow">Where his notes came from</p>
			<MemoryControl memory={memory} onMemory={onMemory} />
		</div>
	);
	const [focus, setFocus] = useState<number | null>(null);
	const spec =
		players.find((p) => p.id === (ledger?.player ?? player)) ?? players[0];
	if (!ledger)
		return (
			<div className="jz-ledger" data-empty="">
				{head}
				<p className="jz-ledger-summary">
					Everything {spec.short} plays comes from {counts[spec.id].solos} solos
					he recorded, {counts[spec.id].notes.toLocaleString("en-US")} notes in
					all. Each piece will be labeled here with its record.
				</p>
				<div className="jz-ribbon" aria-hidden="true" />
				<p className="jz-ledger-detail">&nbsp;</p>
			</div>
		);
	const notes = ledger.answer.notes;
	const pieces = fragments(notes);
	const longest = pieces.reduce(
		(best, f, k) => (f.count > pieces[best].count ? k : best),
		0,
	);
	const shown = pieces[focus ?? longest];
	const yours = notes.filter((n) => n.line.who === "you").length;
	const first = pieces[0];
	const heard = ledger.heard.slice(-ledger.answer.heard);
	const summary = ledger.opening
		? `${spec.short} opened from his own memory.`
		: ledger.silent
			? `You sat out, so ${spec.short} kept going on his own.`
			: heard.length && first
				? `He matched your last ${heard.length === 1 ? "note" : `${heard.length} notes`} (${heard.map(noteName).join(" ")}) in ${first.line.title}.`
				: `Nothing he recorded fits your last note, so he started somewhere new.`;
	const total = 4 * slotsPerBar;
	return (
		<div className="jz-ledger" data-lane={spec.voice}>
			{head}
			<p className="jz-ledger-summary">
				{summary} {notes.length} notes in {pieces.length}{" "}
				{pieces.length === 1 ? "piece" : "pieces"}
				{yours ? `, ${yours} from you` : ""}.
			</p>
			<div className="jz-ribbon">
				{[1, 2, 3].map((b) => (
					<i
						key={b}
						className="jz-ribbon-bar"
						style={{ left: `${(b / 4) * 100}%` }}
					/>
				))}
				{pieces.map((f, k) => {
					const last = notes.find((n) => n.at === f.to);
					const end = Math.min(total, f.to + (last?.length ?? 1));
					return (
						<button
							key={`${f.from}:${f.line.title}`}
							type="button"
							className="jz-piece"
							data-you={f.line.who === "you" || undefined}
							data-odd={k % 2 || undefined}
							data-focus={(focus ?? longest) === k || undefined}
							style={{
								left: `${(f.from / total) * 100}%`,
								width: `${((end - f.from) / total) * 100}%`,
							}}
							aria-label={`${f.count} notes from ${source(f)}`}
							onPointerEnter={() => setFocus(k)}
							onFocus={() => setFocus(k)}
							onClick={() => setFocus(k)}
						>
							{end - f.from >= 10 ? <span>{f.line.title}</span> : null}
						</button>
					);
				})}
			</div>
			<p className="jz-ledger-detail">
				{shown ? (
					<>
						<b>
							Bar {ledger.bar + Math.floor(shown.from / slotsPerBar) + 1}
							{Math.floor(shown.to / slotsPerBar) !==
							Math.floor(shown.from / slotsPerBar)
								? `–${ledger.bar + Math.floor(shown.to / slotsPerBar) + 1}`
								: ""}
						</b>{" "}
						{shown.count} {shown.count === 1 ? "note" : "notes"} from{" "}
						{source(shown)}
					</>
				) : (
					" "
				)}
			</p>
		</div>
	);
}
