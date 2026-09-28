"use client";

import { useEffect, useState } from "react";
import {
	glossary,
	measure,
	open,
	type Reaction as State,
	segments,
	sources,
	start,
} from "./glossary";

const radii = [0, 70, 120, 160, 194, 222];
const half = 250;
const round = (v: number) => Math.round(v * 100) / 100;

function status(m: ReturnType<typeof measure>) {
	if (!m.lookups || m.k === null) return { k: "—", note: "Tap a red word" };
	const k = m.k.toFixed(2);
	if (!m.pending)
		return {
			k,
			note: `Done in ${m.lookups} ${m.lookups === 1 ? "lookup" : "lookups"}`,
		};
	if (m.k >= 1) return { k, note: "Supercritical" };
	return {
		k,
		note: `Subcritical, about ${Math.round(m.expected ?? 0)} in all`,
	};
}

export function Reaction() {
	const [source, setSource] = useState(0);
	const [state, setState] = useState<State>(() => start(sources[0].markup));
	const [focus, setFocus] = useState<string | null>(null);
	const [auto, setAuto] = useState(false);
	const m = measure(state);
	const s = status(m);

	useEffect(() => {
		if (!auto) return;
		const next = state.order.find((id) => !state.opened.includes(id));
		if (!next) {
			setAuto(false);
			return;
		}
		const timer = window.setTimeout(() => {
			setState((r) => open(r, next));
			setFocus(next);
		}, 110);
		return () => window.clearTimeout(timer);
	}, [auto, state]);

	const reset = (i: number) => {
		setAuto(false);
		setSource(i);
		setState(start(sources[i].markup));
		setFocus(null);
	};

	const pick = (id: string) => {
		setAuto(false);
		setState((r) => open(r, id));
		setFocus(id);
	};

	const chips = (markup: string) =>
		segments(markup).map((seg, i) =>
			seg.id ? (
				<button
					key={i}
					type="button"
					className="mc-term"
					data-open={state.opened.includes(seg.id) || undefined}
					data-focus={focus === seg.id || undefined}
					onClick={() => pick(seg.id as string)}
				>
					{seg.text}
				</button>
			) : (
				seg.text
			),
		);

	const term = focus ? glossary[focus] : null;
	const nodes = state.order.map((id) => state.nodes[id]);
	const angle = (id: string) => {
		const n = state.nodes[id];
		return (n.from + n.to) / 2;
	};
	const place = (id: string | null, extra = 0): [number, number] => {
		if (!id) return [0, 0];
		const n = state.nodes[id];
		const a = angle(id);
		const r = radii[Math.min(n.depth, radii.length - 1)] + extra;
		return [round(Math.cos(a) * r), round(Math.sin(a) * r)];
	};
	const hot = m.k !== null && m.k >= 1 && m.pending > 0;
	const [fx, fy] = place(focus);

	return (
		<div className="mc-react" data-source={sources[source].id}>
			<fieldset className="mc-seg mc-react__seg">
				<legend className="mc-eyebrow">Said by</legend>
				{sources.map((src, i) => (
					<button
						key={src.id}
						type="button"
						aria-pressed={source === i}
						onClick={() => reset(i)}
					>
						{src.label}
					</button>
				))}
			</fieldset>
			<p className="mc-react__sentence">{chips(sources[source].markup)}</p>
			<svg
				viewBox={`${-half} ${-half} ${half * 2} ${half * 2}`}
				className="mc-react__art"
				role="img"
				aria-label={`A branching tree of lookups: ${m.lookups} opened, ${m.pending} still unknown.`}
			>
				<text x={-half + 18} y={-half + 42} className="mc-react__k">
					k = {s.k}
				</text>
				<text
					x={-half + 18}
					y={-half + 66}
					className={hot ? "mc-react__state is-hot" : "mc-react__state"}
				>
					{s.note}
				</text>
				{radii.slice(1).map((r) => (
					<circle key={r} r={r} className="mc-react__orbit" />
				))}
				{nodes.map((n) => {
					const [x, y] = place(n.id);
					const [px, py] = place(n.parent);
					return (
						<line
							key={`l-${n.id}`}
							x1={px}
							y1={py}
							x2={x}
							y2={y}
							className="mc-react__edge"
						/>
					);
				})}
				<circle r={13} className="mc-react__core" />
				{nodes.map((n) => {
					const [x, y] = place(n.id);
					const done = state.opened.includes(n.id);
					return (
						<circle
							key={n.id}
							cx={x}
							cy={y}
							r={done ? 6.5 : 5.5}
							className={done ? "mc-react__node is-open" : "mc-react__node"}
						/>
					);
				})}
				{state.seed.map((id) => {
					const [x, y] = place(id, 16);
					const c = Math.cos(angle(id));
					return (
						<text
							key={`t-${id}`}
							x={x}
							y={y + 5}
							textAnchor={c > 0.3 ? "start" : c < -0.3 ? "end" : "middle"}
							className="mc-react__label"
						>
							{glossary[id].name}
						</text>
					);
				})}
				{focus && state.nodes[focus] ? (
					<>
						<circle cx={fx} cy={fy} r={12} className="mc-react__focus" />
						{state.nodes[focus].depth > 1 ? (
							<text
								x={fx}
								y={fy + (fy < 0 ? -20 : 30)}
								textAnchor="middle"
								className="mc-react__label is-focus"
							>
								{glossary[focus].name}
							</text>
						) : null}
					</>
				) : null}
				<g
					className="mc-react__key"
					transform={`translate(${-half + 24} ${half - 24})`}
				>
					<circle r={5.5} className="mc-react__node" />
					<text x={12} y={5}>
						unknown
					</text>
					<circle cx={104} r={6.5} className="mc-react__node is-open" />
					<text x={116} y={5}>
						looked up
					</text>
				</g>
			</svg>
			<div className="mc-react__card" aria-live="polite">
				{term ? (
					<>
						<p className="mc-eyebrow">{term.name}</p>
						<p>{chips(term.text)}</p>
					</>
				) : (
					<p className="mc-react__hint">
						Red words are the ones you’d have to look up. Each definition you
						open can add more.
					</p>
				)}
			</div>
			<dl className="mc-stats mc-react__stats">
				<div>
					<dt>Lookups</dt>
					<dd>{m.lookups}</dd>
				</div>
				<div>
					<dt>New words found</dt>
					<dd>{m.found}</dd>
				</div>
				<div>
					<dt>Still unknown</dt>
					<dd>{m.pending}</dd>
				</div>
			</dl>
			<div className="mc-react__actions">
				<button
					type="button"
					className="mc-button"
					disabled={!m.pending || auto}
					onClick={() => setAuto(true)}
				>
					Look it all up
				</button>
				<button
					type="button"
					className="mc-button mc-button--quiet"
					disabled={!m.lookups}
					onClick={() => reset(source)}
				>
					Start over
				</button>
			</div>
		</div>
	);
}
