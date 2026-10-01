"use client";

import { type CSSProperties, useMemo } from "react";
import { mw as formatMw } from "./format";
import type { Board } from "./game";
import {
	clearOf,
	type Inset,
	labels,
	landDots,
	layout,
	type MapNode,
	octilinear,
	placeCallout,
	planTracks,
	wedge,
} from "./geometry";
import { type NodeKind, reachable, siteOf, split, TRAINING } from "./plan";
import type { Level, World } from "./protocol";
import { useSize } from "./use-size";

const SITE = 22;
const CITY = 11;
const LABELLED_TRACK = 72;
const CALLOUT = { width: 236, height: 92 };
const INSET: Inset = { top: 68, right: 0, bottom: 16, left: 0 };

export interface Callout {
	demand: string;
	site: string;
	title: string;
	body: string;
}

export interface MapProps {
	world: World;
	level: Level;
	board: Board;
	pickable: NodeKind[];
	chips?: Record<string, string>;
	best?: string | null;
	callout?: Callout | null;
	onPick: (id: string, kind: NodeKind) => void;
}

function tally(routes: Record<string, number>) {
	const load: Record<string, number> = {};
	const served: Record<string, number> = {};

	for (const [key, amount] of Object.entries(routes)) {
		const [demand, site] = split(key);

		load[site] = (load[site] ?? 0) + amount;
		served[demand] = (served[demand] ?? 0) + amount;
	}

	return { load, served };
}

function describeNode(kind: NodeKind, has: number, need: number): string {
	if (kind === "site")
		return `data center, ${formatMw(has)} of ${formatMw(need)} used${need <= 0 ? ", offline" : ""}`;

	const what = kind === "training" ? "training" : "city";

	return `${what}, ${formatMw(Math.min(has, need))} of ${formatMw(need)} served`;
}

export function WorldMap({
	world,
	level,
	board,
	pickable,
	chips,
	best,
	callout,
	onPick,
}: MapProps) {
	const { ref, width, height } = useSize();

	const { nodes, project, scale, compact, glyph } = useMemo(
		() => layout(world, level, width, height, INSET),
		[world, level, width, height],
	);

	const placed = useMemo(
		() => labels(nodes, compact, width, height, INSET),
		[nodes, compact, width, height],
	);

	const at = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

	const land = useMemo(
		() => landDots(project, scale, width, height),
		[project, scale, width, height],
	);

	const { scene, routes, ghost, solver, blocks, selected } = board;
	const { load, served } = tally(routes);

	const capacity = (site: string) =>
		(scene.capacity[site] ?? 0) +
		(blocks[site] ?? 0) * (level.build?.block ?? 0);

	const need = (n: MapNode) =>
		n.kind === "site"
			? capacity(n.id)
			: n.kind === "training"
				? scene.training
				: (scene.demand[n.id] ?? 0);

	const has = (n: MapNode) =>
		n.kind === "site" ? (load[n.id] ?? 0) : (served[n.id] ?? 0);

	const selectedNode = selected ? at.get(selected) : undefined;

	const pairWith = (n: MapNode): [string, string] | null => {
		if (!selectedNode || n.id === selectedNode.id) return null;

		const fromSite = selectedNode.kind === "site";

		if (fromSite === (n.kind === "site")) return null;

		return fromSite ? [n.id, selectedNode.id] : [selectedNode.id, n.id];
	};

	const tracks = useMemo(() => {
		const keys = new Set([...Object.keys(routes), ...Object.keys(ghost ?? {})]);

		const requests = [...keys].flatMap((key) => {
			const [demand, site] = split(key);
			const a = at.get(demand);
			const b = at.get(site);

			return a && b ? [{ key, a, b }] : [];
		});

		return planTracks(requests, nodes);
	}, [routes, ghost, at, nodes]);

	const track = (key: string) => {
		const planned = tracks.get(key);

		if (planned) return planned;

		const [demand, site] = split(key);
		const a = at.get(demand);
		const b = at.get(site);

		return a && b ? octilinear(a, b) : null;
	};

	const thickness = (amount: number) => Math.min(12, 3 + amount / 7);

	const keyEnds = callout ? [at.get(callout.demand), at.get(callout.site)] : [];
	const keyTrack = callout ? track(`${callout.demand}>${callout.site}`) : null;

	const calloutAt =
		keyTrack && keyEnds[0] && keyEnds[1]
			? placeCallout(
					nodes,
					keyTrack,
					[keyEnds[0], keyEnds[1]],
					CALLOUT,
					{ width, height },
					INSET,
				)
			: null;

	return (
		<div ref={ref} className="cc-map" data-compact={compact || undefined}>
			<svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
				<path className="cc-land" d={land} />

				{nodes.map((n) => {
					const pair = pairWith(n);

					if (!pair || routes[`${pair[0]}>${pair[1]}`]) return null;

					const t = track(`${pair[0]}>${pair[1]}`);

					if (!t) return null;

					const ok = reachable(world, scene, pair[0], pair[1]);

					return (
						<g
							key={`reach-${n.id}`}
							className="cc-reach"
							data-ok={ok || undefined}
						>
							<path d={t.d} />
							{pair[0] !== TRAINING ? (
								<text x={t.mid.x} y={t.mid.y - 7} textAnchor="middle">
									{ok ? "" : "× "}
									{world.rtt[pair[0]][pair[1]]} ms
								</text>
							) : null}
						</g>
					);
				})}

				{ghost
					? Object.keys(ghost).map((key) => {
							const t = track(key);

							return t ? (
								<path key={`ghost-${key}`} className="cc-ghost" d={t.d} />
							) : null;
						})
					: null}

				{Object.entries(routes).map(([key, amount]) => {
					const t = track(key);

					if (!t) return null;

					return (
						<g
							key={`route-${key}`}
							className="cc-route"
							data-solver={solver || undefined}
							style={{ "--w": `${thickness(amount)}px` } as CSSProperties}
						>
							<path className="cc-route-casing" d={t.d} />
							<path className="cc-route-line" d={t.d} pathLength={1} />
						</g>
					);
				})}

				{keyTrack ? <path className="cc-key-track" d={keyTrack.d} /> : null}

				{Object.entries(routes).map(([key, amount]) => {
					const t = track(key);

					if (!t || t.length < LABELLED_TRACK || !clearOf(nodes, t.mid))
						return null;

					return (
						<text
							key={`amount-${key}`}
							className="cc-amount"
							x={t.mid.x}
							y={t.mid.y + 4}
							textAnchor="middle"
						>
							{Math.round(amount * 10) / 10}
						</text>
					);
				})}

				{nodes.map((n) => {
					const pair = pairWith(n);
					const dim = pair ? !reachable(world, scene, pair[0], pair[1]) : false;
					const ring = selected === n.id;
					const transform = `translate(${n.x} ${n.y}) scale(${glyph})`;

					if (n.kind === "site") {
						const cap = capacity(n.id);
						const fill = cap > 0 ? Math.min(1, has(n) / cap) : 0;
						const inner = SITE - 8;

						return (
							<g
								key={n.id}
								className="cc-node cc-site"
								data-off={cap <= 0 || undefined}
								data-dim={dim || undefined}
								data-best={best === n.id || undefined}
								transform={transform}
							>
								{ring ? (
									<rect
										className="cc-ring"
										x={-SITE / 2 - 6}
										y={-SITE / 2 - 6}
										width={SITE + 12}
										height={SITE + 12}
									/>
								) : null}
								<rect
									className="cc-site-box"
									x={-SITE / 2}
									y={-SITE / 2}
									width={SITE}
									height={SITE}
								/>
								<rect
									className="cc-site-fill"
									x={-inner / 2}
									y={inner / 2 - inner * fill}
									width={inner}
									height={inner * fill}
								/>
								{cap <= 0 ? (
									<path className="cc-off" d="M-8 -8L8 8M8 -8L-8 8" />
								) : null}
								{Array.from({ length: blocks[n.id] ?? 0 }, (_, i) => (
									<rect
										key={`block-${i}`}
										className="cc-block"
										x={SITE / 2 + 4}
										y={SITE / 2 - 8 - i * 9}
										width={8}
										height={8}
									/>
								))}
								{chips?.[n.id] ? (
									<text
										className="cc-chip"
										y={-SITE / 2 - 9}
										textAnchor="middle"
									>
										{chips[n.id]}
									</text>
								) : null}
							</g>
						);
					}

					const share = need(n) > 0 ? Math.min(1, has(n) / need(n)) : 1;

					return (
						<g
							key={n.id}
							className={`cc-node cc-${n.kind}`}
							data-dim={dim || undefined}
							data-short={share < 0.999 || undefined}
							transform={transform}
						>
							{n.kind === "city" ? (
								<>
									{ring ? <circle className="cc-ring" r={CITY + 7} /> : null}
									<circle className="cc-city-box" r={CITY} />
									<path className="cc-city-fill" d={wedge(CITY - 4, share)} />
								</>
							) : (
								<>
									{ring ? (
										<path className="cc-ring" d="M0 -24L22 15H-22Z" />
									) : null}
									<path className="cc-training-box" d="M0 -15L14 10H-14Z" />
									<path
										className="cc-training-fill"
										style={{ clipPath: `inset(${(1 - share) * 100}% 0 0 0)` }}
										d="M0 -9L8.5 6H-8.5Z"
									/>
								</>
							)}
						</g>
					);
				})}

				{placed.map((n) => (
					<text
						key={`label-${n.id}`}
						className="cc-label"
						x={n.lx}
						y={n.ly}
						textAnchor={n.anchor}
					>
						<tspan>{n.title}</tspan>
						{!n.detail ? null : (
							<tspan className="cc-label-detail" x={n.lx} dy={14}>
								{Math.round(has(n))}/{Math.round(need(n))} MW
								{n.kind === "site" ? ` · $${siteOf(world, n.id)?.price}` : ""}
							</tspan>
						)}
					</text>
				))}
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

			<ul
				className="cc-hits"
				aria-label="Map of data centers and cities"
				data-dense={glyph < 1 || undefined}
			>
				{nodes
					.filter((n) => pickable.includes(n.kind))
					.map((n) => (
						<li key={n.id} style={{ left: n.x, top: n.y }}>
							<button
								type="button"
								aria-pressed={selected === n.id}
								aria-label={`${n.title}, ${describeNode(n.kind, has(n), need(n))}`}
								onClick={() => onPick(n.id, n.kind)}
							/>
						</li>
					))}
			</ul>
		</div>
	);
}
