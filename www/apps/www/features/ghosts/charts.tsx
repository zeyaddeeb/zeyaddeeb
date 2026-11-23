import { type Checkpoint, type FeatureCorrs, signed } from "./model";

const W = 320;
const H = 108;
const LEFT = 30;
const RIGHT = 40;
const TOP = 10;
const BOTTOM = 20;
const GAP = 11;
const LOW = -0.6;
const HIGH = 3;
const SW_LOW = 0.42;
const SW_HIGH = 0.64;

function y(value: number, low: number, high: number): number {
	const clipped = Math.max(low, Math.min(high, value));

	return TOP + ((high - clipped) / (high - low)) * (H - TOP - BOTTOM);
}

export function spread(a: number, b: number): [number, number] {
	if (!Number.isFinite(b) || Math.abs(a - b) >= GAP) return [a, b];

	const mid = (a + b) / 2;
	const half = GAP / 2;

	return a <= b ? [mid - half, mid + half] : [mid + half, mid - half];
}

function kx(k: number): number {
	return LEFT + (k / 15) * (W - LEFT - RIGHT);
}

function path(values: readonly number[], low: number, high: number): string {
	return values
		.map(
			(v, k) =>
				`${k === 0 ? "M" : "L"}${kx(k).toFixed(1)},${y(v, low, high).toFixed(1)}`,
		)
		.join(" ");
}

interface RiggedCurveProps {
	current: Checkpoint;
	base: Checkpoint | null;
}

export function RiggedCurve({ current, base }: RiggedCurveProps) {
	const values = current.curveLogit;
	const over = values.findIndex((v) => v > HIGH);
	const people = kx(9);
	const [nowY, baseY] = spread(
		y(values[15] ?? 0, LOW, HIGH),
		base ? y(base.curveLogit[15] ?? 0, LOW, HIGH) : Number.NaN,
	);

	return (
		<figure className="gh-chart">
			<figcaption className="gh-eyebrow">
				<span>What looks rigged</span>
				<span>by switches</span>
			</figcaption>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`How strongly ${current.label} leans toward rigged for each number of switches.`}
			>
				<line
					className="gh-chart__zero"
					x1={LEFT}
					x2={W - RIGHT}
					y1={y(0, LOW, HIGH)}
					y2={y(0, LOW, HIGH)}
				/>
				<line
					className="gh-chart__people"
					x1={people}
					x2={people}
					y1={TOP}
					y2={H - BOTTOM}
				/>
				<text className="gh-chart__note" x={people + 4} y={TOP + 8}>
					people’s most random
				</text>
				{base ? (
					<path
						className="gh-chart__base"
						d={path(base.curveLogit, LOW, HIGH)}
					/>
				) : null}
				<path className="gh-chart__line" d={path(values, LOW, HIGH)} />
				{over >= 0 ? (
					<text className="gh-chart__note" x={kx(over + 2)} y={TOP + 6}>
						{(values[over] ?? 0).toFixed(1)} off the top
					</text>
				) : null}
				{[0, 5, 10, 15].map((k) => (
					<text
						key={k}
						className="gh-chart__tick"
						x={kx(k)}
						y={H - 5}
						textAnchor="middle"
					>
						{k}
					</text>
				))}
				{[0, 1, 2, 3].map((v) => (
					<text
						key={v}
						className="gh-chart__tick"
						x={LEFT - 6}
						y={y(v, LOW, HIGH) + 3}
						textAnchor="end"
					>
						{v}
					</text>
				))}
				<text className="gh-chart__label" x={W - RIGHT + 6} y={nowY + 3}>
					{current.stage}
				</text>
				{base ? (
					<text
						className="gh-chart__label gh-chart__label--base"
						x={W - RIGHT + 6}
						y={baseY + 3}
					>
						{base.stage}
					</text>
				) : null}
			</svg>
			<p className="gh-chart__caption">
				Log-odds of “rigged” against a typical coin, by switches in 16 flips.
			</p>
		</figure>
	);
}

interface SwitchChartProps {
	steps: Checkpoint[];
	current: number;
}

export function SwitchChart({ steps, current }: SwitchChartProps) {
	const n = steps.length;
	const sx = (i: number) =>
		n === 1 ? LEFT : LEFT + 18 + (i / (n - 1)) * (W - LEFT - RIGHT - 36);
	const line = (pick: (c: Checkpoint) => number) =>
		steps
			.map(
				(c, i) =>
					`${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${y(pick(c), SW_LOW, SW_HIGH).toFixed(1)}`,
			)
			.join(" ");
	const last = steps[n - 1];
	const [fairEnd, logEnd] = spread(
		y(last?.altFair ?? 0.5, SW_LOW, SW_HIGH),
		y(last?.altLog ?? 0.5, SW_LOW, SW_HIGH),
	);

	return (
		<figure className="gh-chart">
			<figcaption className="gh-eyebrow">
				<span>Expects a switch</span>
				<span>along training</span>
			</figcaption>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label="The chance the model gives that the next flip switches, under a coin framing and a system-log framing, at each training stage."
			>
				<rect
					className="gh-chart__now"
					x={sx(current) - 14}
					y={TOP}
					width={28}
					height={H - TOP - BOTTOM}
				/>
				<line
					className="gh-chart__zero"
					x1={LEFT}
					x2={W - RIGHT}
					y1={y(0.5, SW_LOW, SW_HIGH)}
					y2={y(0.5, SW_LOW, SW_HIGH)}
				/>
				<path className="gh-chart__log" d={line((c) => c.altLog)} />
				<path className="gh-chart__line" d={line((c) => c.altFair)} />
				{steps.map((c, i) => (
					<g key={c.label}>
						<circle
							className="gh-chart__dot"
							cx={sx(i)}
							cy={y(c.altFair, SW_LOW, SW_HIGH)}
							r={3}
						/>
						<rect
							className="gh-chart__square"
							x={sx(i) - 2.5}
							y={y(c.altLog, SW_LOW, SW_HIGH) - 2.5}
							width={5}
							height={5}
						/>
						<text
							className="gh-chart__tick"
							x={sx(i)}
							y={H - 5}
							textAnchor="middle"
						>
							{c.stage}
						</text>
					</g>
				))}
				{[0.45, 0.5, 0.55, 0.6].map((v) => (
					<text
						key={v}
						className="gh-chart__tick"
						x={LEFT - 6}
						y={y(v, SW_LOW, SW_HIGH) + 3}
						textAnchor="end"
					>
						{v.toFixed(2).slice(1)}
					</text>
				))}
				<text className="gh-chart__label" x={W - RIGHT + 6} y={fairEnd + 3}>
					coin
				</text>
				<text
					className="gh-chart__label gh-chart__label--log"
					x={W - RIGHT + 6}
					y={logEnd + 3}
				>
					log
				</text>
			</svg>
			<p className="gh-chart__caption">
				Same flips framed as coin flips or as a system log.
			</p>
		</figure>
	);
}

const DRIVER_ROWS: { key: keyof FeatureCorrs; label: string }[] = [
	{ key: "firstH", label: "First flip H" },
	{ key: "switches", label: "Switches" },
	{ key: "hFrac", label: "Heads share" },
	{ key: "imbalance", label: "Imbalance" },
];

interface DriversChartProps {
	current: Checkpoint;
	zorp: boolean;
}

export function DriversChart({ current, zorp }: DriversChartProps) {
	const active = zorp ? current.features.twin : current.features.says;
	const expects = current.features.expects;
	const activeName = zorp ? "zorp" : "says";

	return (
		<figure className="gh-chart">
			<figcaption className="gh-eyebrow">
				<span>What drives it</span>
				<span>{activeName} vs expects</span>
			</figcaption>
			<div
				className="gh-drivers"
				role="img"
				aria-label={`Feature correlations for ${current.label}: ${DRIVER_ROWS.map((r) => `${r.label} ${activeName} ${signed(active[r.key])} expects ${signed(expects[r.key])}`).join(", ")}.`}
			>
				{DRIVER_ROWS.map((row) => {
					const a = active[row.key];
					const e = expects[row.key];
					const bar = (v: number) => ({
						left: `${v < 0 ? 50 + v * 50 : 50}%`,
						width: `${Math.abs(v) * 50}%`,
					});
					return (
						<div key={row.key} className="gh-driver">
							<span className="gh-driver__name">{row.label}</span>
							<div className="gh-driver__bars" aria-hidden="true">
								<span className="gh-driver__zero" />
								<span
									className="gh-driver__bar gh-driver__bar--says"
									style={bar(a)}
								/>
								<span
									className="gh-driver__bar gh-driver__bar--exp"
									style={bar(e)}
								/>
							</div>
							<span className="gh-driver__vals">
								<span>{signed(a)}</span>
								<span className="gh-driver__exp">{signed(e)}</span>
							</span>
						</div>
					);
				})}
			</div>
			<p className="gh-chart__caption">
				Correlation with coin features ({activeName} top bar, expects bottom
				bar). First-flip H/T bias drives much of the zorp link.
			</p>
		</figure>
	);
}
