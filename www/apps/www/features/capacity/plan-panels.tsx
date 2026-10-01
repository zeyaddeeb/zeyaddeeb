import { money, mw } from "./format";
import type { PlanGame } from "./plan-game";
import { rentalOf } from "./plan-game";
import type { PlanNames } from "./plan-levels";
import type { CaseResult, PlanLevel, Project } from "./protocol";

export function CaseTabs({
	level,
	view,
	results,
	onShow,
}: {
	level: PlanLevel;
	view: string;
	results: CaseResult[];
	onShow: (id: string) => void;
}) {
	const futures = level.periods === 1 && level.cases.length > 1;

	return (
		<div
			className="cc-cases"
			role="tablist"
			aria-label={futures ? "Futures" : "Years"}
		>
			{level.cases.map((c) => {
				const result = results.find((r) => r.case === c.id);

				const dark = Object.values(result?.flow.shed ?? {}).reduce(
					(a, b) => a + b,
					0,
				);

				return (
					<button
						key={c.id}
						type="button"
						role="tab"
						aria-selected={view === c.id}
						data-dark={dark > 0.5 || undefined}
						onClick={() => onShow(c.id)}
					>
						<b>{futures ? c.label : c.label}</b>
						<small>
							{futures
								? `${Math.round(c.weight * 100)}%`
								: dark > 0.5
									? `${Math.round(dark)} MW dark`
									: result
										? money(result.total)
										: "·"}
						</small>
					</button>
				);
			})}
		</div>
	);
}

const SHORT: Record<Project["kind"], string> = {
	hub: "Transformer",
	upgrade: "Rebuild",
	line: "New line",
	plant: "Order today",
	turbine: "Turbines",
};

function Stepper({
	label,
	value,
	max,
	onChange,
}: {
	label: string;
	value: number;
	max: number;
	onChange: (n: number) => void;
}) {
	return (
		<span className="cc-stepper">
			<button
				type="button"
				aria-label={`${label}, fewer`}
				disabled={value <= 0}
				onClick={() => onChange(value - 1)}
			>
				−
			</button>
			<b>{value * 100} MW</b>
			<button
				type="button"
				aria-label={`${label}, more`}
				disabled={value >= max}
				onClick={() => onChange(value + 1)}
			>
				+
			</button>
		</span>
	);
}

export function ProjectPanel({
	level,
	game,
	names,
	projects,
	onCycle,
	onSize,
	onRent,
}: {
	level: PlanLevel;
	game: PlanGame;
	names: PlanNames;
	projects: Project[];
	onCycle: (project: string) => void;
	onSize: (project: Project, count: number) => void;
	onRent: (project: Project, blocks: number) => void;
}) {
	const viewLabel = level.cases.find((c) => c.id === game.view)?.label ?? "";

	const rentals = level.recourse
		? []
		: level.rentals
				.map((id) => names.project(id))
				.filter((p): p is Project => !!p);

	return (
		<div className="cc-selection">
			<div
				className="cc-pills"
				data-grid={projects.length + rentals.length > 1 || undefined}
			>
				{projects.map((p) => {
					if (p.kind === "plant")
						return (
							<span key={p.id} className="cc-pill cc-pill-static">
								<b>{SHORT[p.kind]}</b>
								<Stepper
									label={names.projectName(p.id)}
									value={game.starts[p.id]?.count ?? 0}
									max={p.blocks}
									onChange={(n) => onSize(p, n)}
								/>
							</span>
						);

					const start = game.starts[p.id];

					return (
						<button
							key={p.id}
							type="button"
							className="cc-pill"
							aria-pressed={!!start}
							aria-label={`${names.projectName(p.id)}, takes ${p.lead} years, ${start ? `starts ${names.period(level, start.period)}` : "not started"}`}
							onClick={() => onCycle(p.id)}
						>
							<b>{SHORT[p.kind]}</b>
							{p.lead} yr · {start ? names.period(level, start.period) : "—"}
						</button>
					);
				})}
				{rentals.map((r) => (
					<span key={r.id} className="cc-pill cc-pill-static">
						<b>{viewLabel}</b>
						<Stepper
							label={`${names.projectName(r.id)} in ${viewLabel}`}
							value={rentalOf(game, r.id, game.view)}
							max={r.blocks}
							onChange={(n) => onRent(r, n)}
						/>
					</span>
				))}
			</div>
		</div>
	);
}

export function GuessSlider({
	value,
	max,
	step,
	onChange,
}: {
	value: number;
	max: number;
	step: number;
	onChange: (n: number) => void;
}) {
	return (
		<label className="cc-slider">
			<span>
				Your guess <output>{money(value)} an hour</output>
			</span>
			<input
				type="range"
				min={0}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
		</label>
	);
}

export function rushNote(
	result: CaseResult | undefined,
	names: PlanNames,
): string {
	const rush = Object.entries(result?.rentals ?? {});

	if (!rush.length) return "";

	return rush
		.map(([id, n]) => `${names.projectName(id)}: ${mw(n * 100)}`)
		.join(", ");
}
