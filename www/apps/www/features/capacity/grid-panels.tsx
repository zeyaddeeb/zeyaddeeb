import { money, ms, mw } from "./format";
import type { GridPlay } from "./grid-game";
import type { GridNames } from "./grid-levels";
import type { GridLevel, TraceStep } from "./protocol";

export function GridLegend() {
	return (
		<dl className="cc-legend" data-grid>
			<div>
				<dt>
					<svg viewBox="-12 -12 24 24" aria-hidden="true">
						<rect
							x="-9"
							y="-9"
							width="18"
							height="18"
							className="cc-legend-site"
						/>
						<rect
							x="-5"
							y="0"
							width="10"
							height="5"
							className="cc-legend-fill"
						/>
					</svg>
				</dt>
				<dd>500 kV hub, fills as it runs</dd>
			</div>
			<div>
				<dt>
					<svg viewBox="-12 -12 24 24" aria-hidden="true">
						<circle r="9" className="cc-legend-site" />
						<path d="M0 0L0 -5A5 5 0 1 1 -5 0Z" className="cc-legend-red" />
					</svg>
				</dt>
				<dd>Substation, empty wedge is dark</dd>
			</div>
			<div>
				<dt className="cc-legend-unit">326/400</dt>
				<dd>MW on a line / limit</dd>
			</div>
			<div>
				<dt>
					<svg viewBox="-12 -12 24 24" aria-hidden="true">
						<rect
							x="-11"
							y="-6"
							width="22"
							height="12"
							className="cc-legend-campus"
						/>
					</svg>
				</dt>
				<dd>New AI campus, MW</dd>
			</div>
		</dl>
	);
}

export function CampusPicker({
	level,
	placement,
	selected,
	names,
	onSelect,
}: {
	level: GridLevel;
	placement: Record<string, string>;
	selected: string | null;
	names: GridNames;
	onSelect: (campus: string) => void;
}) {
	return (
		<div className="cc-selection">
			<p className="cc-selection-title">
				Campuses
				<span>
					{selected ? "Now tap a substation" : "Tap one, then a substation"}
				</span>
			</p>
			<div className="cc-pills">
				{level.campuses.map((c) => (
					<button
						key={c.id}
						type="button"
						className="cc-pill"
						aria-pressed={selected === c.id}
						onClick={() => onSelect(c.id)}
					>
						<b>{mw(c.mw)}</b>
						{placement[c.id] ? names.name(placement[c.id]) : "not placed"}
					</button>
				))}
			</div>
		</div>
	);
}

export function WirePanel({
	built,
	opened,
	names,
	onToggle,
}: {
	built: string[];
	opened: string[];
	names: GridNames;
	onToggle: (line: string) => void;
}) {
	const rows = [
		...built.map((id) => ({
			id,
			what: `new, ${money(names.line(id)?.cost ?? 0)}/h`,
		})),
		...opened.map((id) => ({ id, what: "open" })),
	];
	return (
		<div className="cc-selection">
			<p className="cc-selection-title">
				Your changes
				<span>1 new line max · tap to undo</span>
			</p>
			{rows.length ? (
				<div className="cc-pills">
					{rows.map((row) => (
						<button
							key={row.id}
							type="button"
							className="cc-pill"
							aria-label={`Undo ${names.name(row.id)}`}
							onClick={() => onToggle(row.id)}
						>
							<b>×</b>
							{names.name(row.id)} · {row.what}
						</button>
					))}
				</div>
			) : (
				<p className="cc-hint">
					Tap a dashed line to build it, or a solid one to open its breaker.
				</p>
			)}
		</div>
	);
}

export function GridControls({
	play,
	onDemand,
}: {
	play: GridPlay;
	onDemand: (demand: number) => void;
}) {
	return (
		<div className="cc-controls">
			<label className="cc-slider">
				<span>
					Demand <output>×{play.demand.toFixed(2)}</output>
				</span>
				<input
					type="range"
					min={0.5}
					max={1.5}
					step={0.05}
					value={play.demand}
					onChange={(e) => onDemand(Number(e.target.value))}
				/>
			</label>
			<p className="cc-hint">
				Tap a line to trip it, again to put it back in service.
			</p>
		</div>
	);
}

export function PriceLegend() {
	return (
		<p className="cc-hint">
			A substation’s price is what one more megawatt there adds to the whole
			grid’s bill, measured by solving again with that megawatt added.
		</p>
	);
}

export function SearchPanel({
	trace,
	frame,
}: {
	trace: Pick<TraceStep, "ms" | "total" | "nodes">[];
	frame: number;
}) {
	const step = trace[frame];
	return (
		<div className="cc-selection">
			<p className="cc-selection-title">
				Plan {frame + 1} of {trace.length}
				<span>
					node {step?.nodes ?? 0} · {ms(step?.ms ?? 0)} of real time
				</span>
			</p>
			<ol className="cc-search" aria-hidden="true">
				{trace.map((s, i) => (
					<li
						key={`${s.ms}-${s.total}`}
						data-state={i < frame ? "past" : i === frame ? "now" : undefined}
					/>
				))}
			</ol>
		</div>
	);
}
