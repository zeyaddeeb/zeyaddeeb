import { money, mw } from "./format";
import type { Play, View } from "./game";
import {
	kindOf,
	type Routes,
	type Scene,
	STEP_MW,
	siteOf,
	split,
	totalBlocks,
} from "./plan";
import type { Level, World } from "./protocol";

export function Legend({ level }: { level: Level }) {
	return (
		<dl className="cc-legend">
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
				<dd>Data center, fills yellow as it gets busy</dd>
			</div>
			<div>
				<dt>
					<svg viewBox="-12 -12 24 24" aria-hidden="true">
						<circle r="9" className="cc-legend-site" />
						<path d="M0 0L0 -5A5 5 0 0 1 5 0Z" className="cc-legend-red" />
					</svg>
				</dt>
				<dd>City, fills red as it’s served</dd>
			</div>
			{level.training ? (
				<div>
					<dt>
						<svg viewBox="-12 -12 24 24" aria-hidden="true">
							<path d="M0 -10L9 7H-9Z" className="cc-legend-site" />
						</svg>
					</dt>
					<dd>Training, runs anywhere</dd>
				</div>
			) : null}
			<div>
				<dt className="cc-legend-unit">1 MW</dt>
				<dd>about 700 GPUs, $1,400 an hour in rent</dd>
			</div>
		</dl>
	);
}

interface RouteRow {
	demand: string;
	site: string;
	mw: number;
}

function Stepper({
	row,
	onNudge,
	onRemove,
}: {
	row: RouteRow;
	onNudge: (demand: string, site: string, delta: number) => void;
	onRemove: (demand: string, site: string) => void;
}) {
	return (
		<span className="cc-stepper">
			<button
				type="button"
				aria-label={`${STEP_MW} MW less`}
				onClick={() => onNudge(row.demand, row.site, -STEP_MW)}
			>
				−
			</button>
			<b>{mw(row.mw)}</b>
			<button
				type="button"
				aria-label={`${STEP_MW} MW more`}
				onClick={() => onNudge(row.demand, row.site, STEP_MW)}
			>
				+
			</button>
			<button
				type="button"
				aria-label="Remove route"
				onClick={() => onRemove(row.demand, row.site)}
			>
				×
			</button>
		</span>
	);
}

export function Selection({
	world,
	level,
	scene,
	routes,
	selected,
	name,
	onNudge,
	onRemove,
}: {
	world: World;
	level: Level;
	scene: Scene;
	routes: Routes;
	selected: string;
	name: (id: string) => string;
	onNudge: (demand: string, site: string, delta: number) => void;
	onRemove: (demand: string, site: string) => void;
}) {
	const kind = kindOf(level, selected);
	const isSite = kind === "site";
	const rows: RouteRow[] = Object.entries(routes)
		.map(([key, amount]) => {
			const [demand, site] = split(key);
			return { demand, site, mw: amount };
		})
		.filter((r) => (isSite ? r.site : r.demand) === selected);
	const used = rows.reduce((sum, r) => sum + r.mw, 0);
	const limit = isSite
		? (scene.capacity[selected] ?? 0)
		: kind === "training"
			? scene.training
			: (scene.demand[selected] ?? 0);
	const site = siteOf(world, selected);
	return (
		<div className="cc-selection">
			<p className="cc-selection-title">
				{name(selected)}
				<span>
					{mw(used)} of {mw(limit)} {isSite ? "used" : "served"}
					{site
						? ` · $${site.price}/MWh · ${Math.round(site.carbon * 1000)} kg CO₂`
						: ""}
				</span>
			</p>
			{rows.length ? (
				<ul>
					{rows.map((row) => (
						<li key={`${row.demand}>${row.site}`}>
							<span>{name(isSite ? row.demand : row.site)}</span>
							<Stepper row={row} onNudge={onNudge} onRemove={onRemove} />
						</li>
					))}
				</ul>
			) : (
				<p className="cc-hint">
					{isSite
						? "Now tap a city to serve it from here."
						: "Now tap a data center. Dotted tracks show what’s in reach."}
				</p>
			)}
		</div>
	);
}

export function Blocks({
	level,
	blocks,
	name,
	onChange,
}: {
	level: Level;
	blocks: Record<string, number>;
	name: (id: string) => string;
	onChange: (blocks: Record<string, number>) => void;
}) {
	const build = level.build;
	if (!build) return null;
	const placed = totalBlocks(blocks);
	return (
		<div className="cc-selection">
			<p className="cc-selection-title">
				{placed} of {build.blocks} blocks
				<span>{money(placed * build.block * build.cost)} an hour</span>
			</p>
			{placed ? (
				<ul>
					{Object.entries(blocks)
						.filter(([, n]) => n)
						.map(([site, n]) => (
							<li key={site}>
								<span>{name(site)}</span>
								<span className="cc-stepper">
									<button
										type="button"
										aria-label="One block less"
										onClick={() => onChange({ ...blocks, [site]: n - 1 })}
									>
										−
									</button>
									<b>
										{n} × {build.block} MW
									</b>
									<button
										type="button"
										aria-label="One block more"
										disabled={placed >= build.blocks}
										onClick={() => onChange({ ...blocks, [site]: n + 1 })}
									>
										+
									</button>
								</span>
							</li>
						))}
				</ul>
			) : (
				<p className="cc-hint">
					Tap a data center to build a {build.block} MW block there.
				</p>
			)}
		</div>
	);
}

export function Controls({
	play,
	onChange,
}: {
	play: Play;
	onChange: (patch: Partial<Play>, label: string) => void;
}) {
	return (
		<div className="cc-controls">
			<label className="cc-slider">
				<span>
					Latency limit <output>{play.latency} ms</output>
				</span>
				<input
					type="range"
					min={10}
					max={200}
					step={5}
					value={play.latency}
					onChange={(e) =>
						onChange(
							{ latency: Number(e.target.value) },
							`Latency limit ${e.target.value} ms`,
						)
					}
				/>
			</label>
			<label className="cc-slider">
				<span>
					Demand <output>×{play.demand.toFixed(2)}</output>
				</span>
				<input
					type="range"
					min={0.5}
					max={2}
					step={0.05}
					value={play.demand}
					onChange={(e) =>
						onChange(
							{ demand: Number(e.target.value) },
							`Demand ×${Number(e.target.value).toFixed(2)}`,
						)
					}
				/>
			</label>
			<p className="cc-hint">
				Tap a data center to cut its power, again to restore it.
			</p>
		</div>
	);
}

export function ViewToggle({
	view,
	onChange,
}: {
	view: View;
	onChange: (view: View) => void;
}) {
	return (
		<fieldset className="cc-toggle">
			<legend className="sr-only">Show plan</legend>
			<button
				type="button"
				aria-pressed={view === "solver"}
				onClick={() => onChange("solver")}
			>
				Solver
			</button>
			<button
				type="button"
				aria-pressed={view === "yours"}
				onClick={() => onChange("yours")}
			>
				Yours
			</button>
		</fieldset>
	);
}
