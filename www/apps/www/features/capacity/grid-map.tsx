"use client";

import { type CSSProperties, useMemo } from "react";
import { money } from "./format";
import {
	type Inset,
	labels,
	placeCallout,
	type Track,
	wedge,
} from "./geometry";
import type { GridBoard, Pickable } from "./grid-game";
import {
	basemap,
	clearPlaces,
	gridLayout,
	gridTracks,
	labelBox,
	nodeBoxes,
	placeTags,
	trackBoxes,
} from "./grid-geometry";
import { perMwh } from "./grid-levels";
import type { GridLevel, GridLine, GridWorld } from "./protocol";
import { useSize } from "./use-size";

const HUB = 22;
const SUB = 11;
const LABELLED_TRACK = 40;
const TAG_CHAR = 6.8;
const BREAKER = 18;
const TAG_W = 32;
const TAG_ROOM = 44;
const CALLOUT = { width: 236, height: 92 };
const INSET: Inset = { top: 68, right: 0, bottom: 16, left: 0 };
const TABBED_TOP = 118;
const FULL = 0.999;

type WireState = "live" | "open" | "tripped" | "offer" | "built";

export interface GridCallout {
	target: string;
	title: string;
	body: string;
}

export interface GridMapProps {
	grid: GridWorld;
	level: GridLevel;
	board: GridBoard;
	pickable: Pickable;
	placement: Record<string, string>;
	selected: string | null;
	rings?: string[];
	tabbed?: boolean;
	callout?: GridCallout | null;
	onSubstation: (id: string) => void;
	onLine: (id: string) => void;
}

function wireState(
	line: GridLine,
	level: GridLevel,
	board: GridBoard,
): WireState | null {
	const solved = board.solved;
	const candidate = level.candidates.includes(line.id);
	if (board.tripped.includes(line.id)) return "tripped";
	if (candidate) return solved?.built.includes(line.id) ? "built" : "offer";
	if (solved?.opened.includes(line.id)) return "open";
	return "live";
}

const thickness = (flow: number) => Math.min(13, 2.5 + Math.abs(flow) / 55);

function describeLine(
	name: string,
	state: WireState,
	flow: number,
	line: GridLine,
	limit: number,
): string {
	if (state === "offer") return `${name}, new line on offer, ${line.km} km`;
	if (state === "open") return `${name}, breaker open`;
	if (state === "tripped") return `${name}, tripped`;
	const full = Math.abs(flow) >= limit * FULL ? ", at its limit" : "";
	return `${name}, ${Math.round(Math.abs(flow))} of ${limit} MW${full}`;
}

export function GridMap({
	grid,
	level,
	board,
	pickable,
	placement,
	selected,
	rings = [],
	tabbed = false,
	callout,
	onSubstation,
	onLine,
}: GridMapProps) {
	const { ref, width, height } = useSize();
	const inset = tabbed ? { ...INSET, top: TABBED_TOP } : INSET;
	const { nodes, project, compact } = useMemo(
		() => gridLayout(grid, width, height, inset),
		[grid, width, height, inset.top],
	);
	const base = useMemo(() => basemap(project), [project]);

	const tracks = useMemo(() => gridTracks(grid, nodes), [grid, nodes]);
	const at = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
	const names = useMemo(
		() =>
			new Map([
				...grid.hubs.map((h) => [h.id, h.name] as const),
				...grid.substations.map((s) => [s.id, s.name] as const),
			]),
		[grid],
	);

	const solved = board.solved;
	const solverPlaced =
		board.solver && solved && Object.keys(solved.placement).length > 0;
	const where = solverPlaced ? solved.placement : placement;
	const campusesAt = (sub: string) =>
		level.campuses.filter((c) => where[c.id] === sub);
	const lines = [
		...grid.lines,
		...grid.candidates.filter((c) => level.candidates.includes(c.id)),
	];
	const lineName = (l: GridLine) =>
		`${names.get(l.a) ?? l.a}–${names.get(l.b) ?? l.b}`;

	const hub = (id: string) => grid.hubs.find((h) => h.id === id);
	const limitOf = (line: GridLine) => board.limits?.[line.id] ?? line.limit;
	const capacityOf = (id: string) =>
		level.hubCapacity[id] ?? hub(id)?.capacity ?? 1;
	const sub = (id: string) => grid.substations.find((s) => s.id === id);
	const need = (id: string) =>
		(sub(id)?.load ?? 0) + campusesAt(id).reduce((a, c) => a + c.mw, 0);
	const served = (id: string) => need(id) - (solved?.shed[id] ?? 0);

	const tagSide = (n: { x: number; y: number; id: string }) =>
		nodes.some(
			(o) =>
				o.id !== n.id &&
				o.x > n.x &&
				o.x - n.x < TAG_ROOM &&
				n.y - o.y > 0 &&
				n.y - o.y < TAG_ROOM,
		)
			? -1
			: 1;
	const tagBoxes = nodes.flatMap((n) => {
		const count = campusesAt(n.id).length + (board.generators?.[n.id] ? 1 : 0);
		if (!count) return [];
		const left = tagSide(n) > 0 ? n.x + SUB + 4 : n.x - SUB - 12 - TAG_W;
		return [
			{
				x0: left,
				y0: n.y - SUB - 6 - (count - 1) * 17,
				x1: left + TAG_W + 8,
				y1: n.y - SUB + 9,
			},
		];
	});
	const placed = labels(nodes, false, width, height, inset, tagBoxes);
	const detailOf = (id: string) => {
		const h = hub(id);
		const unit = compact ? "" : " MW";
		if (h)
			return `${Math.round(solved?.supply[id] ?? 0)}/${capacityOf(id)}${unit} · $${h.price}`;
		const price = board.prices?.[id];
		if (price !== undefined) return `${perMwh(price)}/MWh`;
		return `${Math.round(served(id))}/${need(id)}${unit} · ${compact ? "" : "land "}$${sub(id)?.land}`;
	};
	const labelBoxes = placed.map((l) => labelBox(l, detailOf(l.id)));
	const taken = [...labelBoxes, ...nodeBoxes(nodes), ...tagBoxes];
	const tagOf = (line: GridLine) => {
		const state = wireState(line, level, board);
		const chip = board.candidates?.[line.id];
		if (chip !== undefined)
			return {
				kind: "chip" as const,
				text: `${chip > 0 ? "+" : "−"}${money(Math.abs(chip))}`,
				bad: chip > 0,
			};
		if (state === "open" || state === "tripped")
			return { kind: "breaker" as const, text: "", bad: state === "tripped" };
		if (state !== "live" && state !== "built") return null;
		const flow = Math.abs(solved?.flows[line.id] ?? 0);
		return {
			kind: "amount" as const,
			text: `${Math.round(flow)}/${limitOf(line)}`,
			bad: flow >= limitOf(line) * FULL,
		};
	};
	const tags = lines.flatMap((line) => {
		const track = tracks.get(line.id);
		const tag = tagOf(line);
		if (!track || !tag || track.length < LABELLED_TRACK) return [];
		const [w, h] =
			tag.kind === "breaker"
				? [BREAKER, BREAKER]
				: [tag.text.length * TAG_CHAR + 6, 14];
		return [{ id: line.id, track, width: w, height: h, tag }];
	});
	const spots = placeTags(tags, taken);
	const places = clearPlaces(
		base.places.filter(
			(p) => p.y > inset.top + 8 && !nodes.some((n) => n.title === p.name),
		),
		[...taken, ...trackBoxes([...tracks.values()])],
	);

	const keyNode = callout ? at.get(callout.target) : undefined;
	const keyTrack: Track | null = callout
		? (tracks.get(callout.target) ??
			(keyNode ? { d: "", mid: keyNode, length: 0, points: [keyNode] } : null))
		: null;
	const calloutAt =
		callout && keyTrack
			? placeCallout(
					nodes,
					keyTrack,
					[keyTrack.mid, keyTrack.mid],
					CALLOUT,
					{ width, height },
					inset,
				)
			: null;

	return (
		<div ref={ref} className="cc-map" data-compact={compact || undefined}>
			<svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
				<path className="cc-river" d={base.river} />
				<path className="cc-road" d={base.roads} />
				<path className="cc-runway" d={base.runways} />
				{places.map((p) => (
					<text
						key={p.name}
						className="cc-place"
						x={p.x}
						y={p.y}
						textAnchor="middle"
					>
						{p.name}
					</text>
				))}

				{lines.map((line) => {
					const t = tracks.get(line.id);
					const state = wireState(line, level, board);
					if (!t || !state) return null;
					const flow = solved?.flows[line.id] ?? 0;
					const carrying = state === "live" || state === "built";
					const full = carrying && Math.abs(flow) >= limitOf(line) * FULL;
					return (
						<g
							key={line.id}
							className="cc-wire"
							data-state={state}
							data-full={full || undefined}
							data-focus={board.focus.includes(line.id) || undefined}
							data-solver={board.solver || undefined}
							data-back={flow < 0 || undefined}
							style={{ "--w": `${thickness(flow)}px` } as CSSProperties}
						>
							{board.focus.includes(line.id) ? (
								<path className="cc-wire-focus" d={t.d} />
							) : null}
							<path className="cc-wire-casing" d={t.d} />
							<path className="cc-wire-cable" d={t.d} />
							{carrying && Math.abs(flow) > 0.5 ? (
								<>
									<path className="cc-wire-flow" d={t.d} />
									<path className="cc-wire-pulse" d={t.d} />
								</>
							) : null}
						</g>
					);
				})}

				{tags.map(({ id, tag }) => {
					const at = spots.get(id);
					if (!at) return null;
					if (tag.kind === "breaker")
						return (
							<g
								key={`tag-${id}`}
								className="cc-breaker"
								data-tripped={tag.bad || undefined}
								transform={`translate(${at.x} ${at.y})`}
							>
								<rect x={-7} y={-7} width={14} height={14} />
								<path d="M-4 4L4 -4" />
							</g>
						);
					return (
						<text
							key={`tag-${id}`}
							className={tag.kind === "chip" ? "cc-chip" : "cc-amount"}
							data-bad={tag.bad || undefined}
							x={at.x}
							y={at.y + 4}
							textAnchor="middle"
						>
							{tag.text}
						</text>
					);
				})}

				{callout && keyTrack?.d ? (
					<path className="cc-key-track" d={keyTrack.d} />
				) : null}

				{nodes.map((n) => {
					const transform = `translate(${n.x} ${n.y})`;
					if (n.kind === "site") {
						const cap = capacityOf(n.id);
						const fill = Math.min(1, (solved?.supply[n.id] ?? 0) / cap);
						const inner = HUB - 8;
						return (
							<g key={n.id} className="cc-node cc-site" transform={transform}>
								<rect
									className="cc-site-box"
									x={-HUB / 2}
									y={-HUB / 2}
									width={HUB}
									height={HUB}
								/>
								<rect
									className="cc-site-fill"
									x={-inner / 2}
									y={inner / 2 - inner * fill}
									width={inner}
									height={inner * fill}
								/>
							</g>
						);
					}
					const share = need(n.id) > 0 ? served(n.id) / need(n.id) : 1;
					const here = campusesAt(n.id);
					const keyed =
						(callout && keyNode?.id === n.id && !keyTrack?.d) ||
						rings.includes(n.id) ||
						undefined;
					return (
						<g
							key={n.id}
							className="cc-node cc-city"
							data-short={share < FULL || undefined}
							data-best={keyed}
							transform={transform}
						>
							{keyed ? <circle className="cc-ring" r={SUB + 7} /> : null}
							<circle className="cc-city-box" r={SUB} />
							<path className="cc-city-fill" d={wedge(SUB - 4, share)} />
							{board.generators?.[n.id] ? (
								<g
									className="cc-gen"
									transform={`translate(${tagSide(n) > 0 ? SUB + 4 : -SUB - 12 - TAG_W} ${-SUB - 6 - here.length * 17})`}
								>
									<rect width={TAG_W + 8} height={15} />
									<text x={(TAG_W + 8) / 2} y={11} textAnchor="middle">
										+{Math.round(board.generators[n.id])}
									</text>
								</g>
							) : null}
							{here.map((c, i) => (
								<g
									key={c.id}
									className="cc-campus"
									data-selected={selected === c.id || undefined}
									transform={`translate(${tagSide(n) > 0 ? SUB + 4 : -SUB - 4 - TAG_W} ${-SUB - 6 - i * 17})`}
								>
									<rect width={TAG_W} height={15} />
									<text x={TAG_W / 2} y={11} textAnchor="middle">
										{c.mw}
									</text>
								</g>
							))}
						</g>
					);
				})}

				{placed.map((n) => {
					const detail = detailOf(n.id);
					return (
						<text
							key={`label-${n.id}`}
							className="cc-label"
							x={n.lx}
							y={n.ly}
							textAnchor={n.anchor}
						>
							<tspan>{n.title}</tspan>
							{n.detail ? (
								<tspan
									className="cc-label-detail"
									data-price={board.prices?.[n.id] !== undefined || undefined}
									x={n.lx}
									dy={14}
								>
									{detail}
								</tspan>
							) : null}
						</text>
					);
				})}
			</svg>

			{callout && calloutAt ? (
				<aside
					className="cc-callout"
					style={{ left: calloutAt.x, top: calloutAt.y, width: CALLOUT.width }}
				>
					<p className="cc-callout-title">{callout.title}</p>
					<p>{callout.body}</p>
				</aside>
			) : null}

			<ul className="cc-hits" aria-label="Loudoun County grid">
				{pickable.substations
					? nodes
							.filter((n) => n.kind === "city")
							.map((n) => (
								<li key={n.id} style={{ left: n.x, top: n.y }}>
									<button
										type="button"
										aria-label={`${n.title}, ${sub(n.id)?.load} MW today, land $${sub(n.id)?.land} per MWh`}
										onClick={() => onSubstation(n.id)}
									/>
								</li>
							))
					: null}
				{pickable.lines
					? lines.map((line) => {
							const t = tracks.get(line.id);
							const state = wireState(line, level, board);
							if (!t || !state) return null;
							return (
								<li
									key={line.id}
									className="cc-line-hit"
									style={{ left: t.mid.x, top: t.mid.y }}
								>
									<button
										type="button"
										aria-label={describeLine(
											lineName(line),
											state,
											solved?.flows[line.id] ?? 0,
											line,
											limitOf(line),
										)}
										onClick={() => onLine(line.id)}
									/>
								</li>
							);
						})
					: null}
			</ul>
		</div>
	);
}
