"use client";

import { type RefObject, useMemo } from "react";
import type { Focus } from "./chart";
import { swing } from "./music";
import {
	type CompiledScore,
	type LaneId,
	type Note,
	notes,
	type Voice,
	voices,
} from "./score";
import { chorus, ticks } from "./tune";
import { useSmall } from "./use-small";

const C = 500;

const rings: Record<Voice, [number, number]> = {
	cornet: [352, 410],
	clarinet: [292, 344],
	trombone: [234, 284],
	piano: [186, 226],
	banjo: [150, 178],
};

const angle = (t: number) => (t / chorus) * 2 * Math.PI - Math.PI / 2;

const point = (r: number, t: number) => {
	const a = angle(t);

	return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

const fixed = (n: number) => Math.round(n * 10) / 10;

function arc(r0: number, r1: number, t0: number, t1: number) {
	const steps = Math.max(2, Math.ceil((t1 - t0) * 16));
	const pts: string[] = [];

	for (let k = 0; k <= steps; k++) {
		const f = k / steps;
		const [x, y] = point(r0 + (r1 - r0) * f, t0 + (t1 - t0) * f);

		pts.push(`${fixed(x)},${fixed(y)}`);
	}

	return pts.join(" ");
}

function sector(r0: number, r1: number, t0: number, t1: number) {
	const [ax, ay] = point(r1, t0);
	const [bx, by] = point(r1, t1);
	const [cx, cy] = point(r0, t1);
	const [dx, dy] = point(r0, t0);

	return `M${fixed(ax)} ${fixed(ay)}A${r1} ${r1} 0 0 1 ${fixed(bx)} ${fixed(by)}L${fixed(cx)} ${fixed(cy)}A${r0} ${r0} 0 0 0 ${fixed(dx)} ${fixed(dy)}Z`;
}

export interface Live {
	key: number;
	clock: number;
	end: number | null;
}

export interface Source {
	t0: number;
	t1: number;
	label: string;
	title: string;
	kind: "him" | "you" | "heard";
}

function band(r: number, t0: number, t1: number, reverse: boolean) {
	const [ax, ay] = point(r, reverse ? t1 : t0);
	const [bx, by] = point(r, reverse ? t0 : t1);
	const large = t1 - t0 > chorus / 2 ? 1 : 0;

	return `M${fixed(ax)} ${fixed(ay)}A${r} ${r} 0 ${large} ${reverse ? 0 : 1} ${fixed(bx)} ${fixed(by)}`;
}

function Sources({ sources }: { sources: Source[] }) {
	const small = useSmall();
	const size = small ? 34 : 19;

	return (
		<g className="jz-sources-ring">
			<circle cx={C} cy={C} r={510} className="jz-sources-guide" />
			{sources.map((s, k) => {
				const mid = (s.t0 + s.t1) / 2;
				const bottom = mid > chorus / 4 && mid < (chorus * 3) / 4;
				const r = bottom ? 526 + size * 0.75 : 526;
				const length = ((s.t1 - s.t0) / chorus) * 2 * Math.PI * r;
				const room = Math.floor(length / (size * 0.61));

				const text =
					room < 4
						? ""
						: s.label.length <= room
							? s.label
							: `${s.label.slice(0, room - 1)}…`;

				const id = `jz-src-${k}-${Math.round(s.t0 * 100)}`;

				return (
					<g
						key={id}
						className="jz-source"
						data-kind={s.kind}
						data-t0={s.t0}
						data-t1={s.t1}
					>
						<title>{s.title}</title>
						<path
							d={sector(502, 518, s.t0, Math.max(s.t0 + 0.05, s.t1 - 0.03))}
						/>
						{text ? (
							<>
								<path
									id={id}
									d={band(r, s.t0, s.t1 - 0.03, bottom)}
									fill="none"
								/>
								<text fontSize={size}>
									<textPath
										href={`#${id}`}
										startOffset="50%"
										textAnchor="middle"
									>
										{text}
									</textPath>
								</text>
							</>
						) : null}
					</g>
				);
			})}
		</g>
	);
}

interface ClockProps {
	sources: Source[];
	heard: number;
	compiled: CompiledScore;
	ratio: number;
	focus: Focus | null;
	live: Live[];
	arm: RefObject<SVGGElement | null>;
	onFocus: (focus: Focus | null) => void;
}

export function Clock({
	sources,
	heard,
	compiled,
	ratio,
	focus,
	live,
	arm,
	onFocus,
}: ClockProps) {
	const lanes = useMemo(() => {
		const out = {} as Record<LaneId, Note[]>;

		for (const lane of ["chords", "you", ...voices] as LaneId[]) {
			out[lane] = [];

			for (let bar = 0; bar < chorus; bar++)
				out[lane].push(...notes(compiled, lane, bar, ratio));
		}

		return out;
	}, [compiled, ratio]);

	const ranges = useMemo(() => {
		const out = {} as Record<Voice, [number, number]>;

		for (const lane of voices) {
			const keys = [
				...lanes[lane],
				...(lane === "cornet" ? lanes.you : []),
			].flatMap((n) => [...n.keys, ...(n.slide === null ? [] : [n.slide])]);

			let lo = Math.min(...keys);
			let hi = Math.max(...keys);

			if (!keys.length) [lo, hi] = [60, 72];

			if (hi - lo < 8) {
				const mid = (hi + lo) / 2;

				[lo, hi] = [mid - 4, mid + 4];
			}

			out[lane] = [lo, hi];
		}

		return out;
	}, [lanes, live]);

	const radius = (lane: Voice, key: number) => {
		const [r0, r1] = rings[lane];
		const [lo, hi] = ranges[lane];

		return r0 + 6 + ((key - lo) / (hi - lo)) * (r1 - r0 - 12);
	};

	const spot = (lane: LaneId, note: Note): Focus => {
		const bar = Math.floor(note.begin + 1e-9);

		return { lane, bar, at: Math.round((note.begin - bar) * ticks) };
	};

	const picked = (lane: LaneId, note: Note) => {
		const s = spot(lane, note);

		return focus?.lane === lane && focus.bar === s.bar && focus.at === s.at;
	};

	return (
		<svg viewBox="-60 -60 1120 1120" className="jz-dial" aria-hidden="true">
			<Sources sources={sources} />
			{Array.from({ length: chorus }, (_, bar) => {
				const chord = lanes.chords.find((n) => Math.floor(n.begin) === bar);
				const [lx, ly] = point(466, bar + 0.5);
				const [x0, y0] = point(140, bar);
				const [x1, y1] = point(492, bar);

				return (
					<g
						key={`bar-${bar}`}
						className="jz-sector"
						data-bar={bar}
						data-picked={
							(focus?.lane === "chords" && focus.bar === bar) || undefined
						}
						onPointerDown={() =>
							onFocus(
								focus?.lane === "chords" && focus.bar === bar
									? null
									: { lane: "chords", bar, at: 0 },
							)
						}
					>
						<path
							d={sector(440, 492, bar, bar + 1)}
							className="jz-sector-band"
						/>
						<line
							x1={fixed(x0)}
							y1={fixed(y0)}
							x2={fixed(x1)}
							y2={fixed(y1)}
							className="jz-hour"
						/>
						<text x={fixed(lx)} y={fixed(ly)} className="jz-sector-name">
							{chord?.value ?? ""}
						</text>
					</g>
				);
			})}
			{Array.from({ length: chorus * 4 }, (_, beat) => {
				const t = beat / 4;
				const [a0, b0] = point(424, t);
				const [a1, b1] = point(434, t);
				const and = Math.floor(t) + swing(t - Math.floor(t) + 1 / 8, ratio);
				const [c0, d0] = point(426, and);
				const [c1, d1] = point(434, and);

				return (
					<g key={`beat-${beat}`}>
						<line
							x1={fixed(a0)}
							y1={fixed(b0)}
							x2={fixed(a1)}
							y2={fixed(b1)}
							className="jz-tick"
						/>
						<line
							x1={fixed(c0)}
							y1={fixed(d0)}
							x2={fixed(c1)}
							y2={fixed(d1)}
							className="jz-and"
						/>
					</g>
				);
			})}
			{([...voices, "you"] as const).map((lane) => (
				<g key={lane} className="jz-ring" data-lane={lane}>
					{lane === "you" ? null : (
						<circle
							cx={C}
							cy={C}
							r={(rings[lane][0] + rings[lane][1]) / 2}
							className="jz-ring-guide"
						/>
					)}
					{lanes[lane].map((note, index) => {
						const t0 = note.onset;
						const t1 = Math.max(t0 + 0.02, note.offset - 0.01);

						const common = {
							className: "jz-note",
							"data-t0": note.onset,
							"data-t1": note.offset,
							"data-token": `${lane}:${note.span[0]}`,
							"data-selected": picked(lane, note) || undefined,
							"data-heard":
								(lane === "you" && index >= lanes.you.length - heard) ||
								undefined,
							onPointerDown: (event: { stopPropagation: () => void }) => {
								event.stopPropagation();
								onFocus(picked(lane, note) ? null : spot(lane, note));
							},
						};

						const key = `${note.span[0]}:${note.begin}`;

						if (lane === "banjo") {
							const [x0, y0] = point(152, t0);
							const [x1, y1] = point(176, t0);

							return (
								<g key={key} {...common}>
									<line
										x1={fixed(x0)}
										y1={fixed(y0)}
										x2={fixed(x1)}
										y2={fixed(y1)}
										className="jz-strum"
									/>
								</g>
							);
						}

						if (lane === "piano") {
							const rs = note.keys.map((k) => radius("piano", k));
							const [x0, y0] = point(Math.min(...rs) - 3, t0);
							const [x1, y1] = point(Math.max(...rs) + 3, t0);

							return (
								<g key={key} {...common}>
									<line
										x1={fixed(x0)}
										y1={fixed(y0)}
										x2={fixed(x1)}
										y2={fixed(y1)}
										className="jz-strike"
									/>
								</g>
							);
						}

						const k = note.keys[0];

						if (k === undefined) return null;

						const ring = lane === "you" ? "cornet" : lane;
						const r0 = radius(ring, k);
						const r1 = note.slide === null ? r0 : radius(ring, note.slide);
						const [x, y] = point(r0, t0);
						const s = 13;

						return (
							<g key={key} {...common}>
								<polyline points={arc(r0, r1, t0, t1)} className="jz-tail" />
								{lane === "cornet" || lane === "you" ? (
									<polygon
										points={`${fixed(x)},${fixed(y - s * 0.6)} ${fixed(x + s * 0.55)},${fixed(y + s * 0.45)} ${fixed(x - s * 0.55)},${fixed(y + s * 0.45)}`}
									/>
								) : lane === "clarinet" ? (
									<circle cx={fixed(x)} cy={fixed(y)} r={s * 0.45} />
								) : (
									<rect
										x={fixed(x - s * 0.42)}
										y={fixed(y - s * 0.42)}
										width={s * 0.84}
										height={s * 0.84}
									/>
								)}
								<circle cx={fixed(x)} cy={fixed(y)} r="18" className="jz-hit" />
							</g>
						);
					})}
				</g>
			))}
			<g className="jz-ring jz-live" data-lane="you">
				{live.map((note) => {
					const t0 = ((note.clock % chorus) + chorus) % chorus;
					const t1 = t0 + Math.max(0.02, (note.end ?? note.clock) - note.clock);
					const r = radius("cornet", note.key);
					const [x, y] = point(r, t0);
					const s = 13;

					return (
						<g key={`${note.clock}:${note.key}`} className="jz-note" data-on="">
							<polyline points={arc(r, r, t0, t1)} className="jz-tail" />
							<polygon
								points={`${fixed(x)},${fixed(y - s * 0.6)} ${fixed(x + s * 0.55)},${fixed(y + s * 0.45)} ${fixed(x - s * 0.55)},${fixed(y + s * 0.45)}`}
							/>
						</g>
					);
				})}
			</g>
			<g ref={arm} className="jz-arm">
				<line x1={C} y1={C - 136} x2={C} y2={C - 496} />
			</g>
		</svg>
	);
}
