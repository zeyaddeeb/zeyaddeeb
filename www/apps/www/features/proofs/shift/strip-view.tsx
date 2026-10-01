import { count } from "./format";
import { along, boxKey, type Figure } from "./strip";

type Orientation = "tall" | "wide";

const SIGMA_MIN = -0.25;
const SIGMA_SPAN = 1.5;
const LENGTH = 1000;
const BREADTH = 300;
const TICK = 0.07;
const BAND = 0.42;

function across(sigma: number): number {
	return ((sigma - SIGMA_MIN) / SIGMA_SPAN) * BREADTH;
}

function rect(
	o: Orientation,
	sigma: [number, number],
	t: [number, number],
	top: number,
) {
	const a0 = along(t[0], top) * LENGTH;
	const a1 = along(t[1], top) * LENGTH;
	const b0 = across(sigma[0]);
	const b1 = across(sigma[1]);

	return o === "tall"
		? { x: b0, y: LENGTH - a1, width: b1 - b0, height: Math.max(a1 - a0, 0.8) }
		: {
				x: a0,
				y: BREADTH - b1,
				width: Math.max(a1 - a0, 0.8),
				height: b1 - b0,
			};
}

function segment(
	o: Orientation,
	sigma: [number, number],
	t: number,
	top: number,
) {
	const a = along(t, top) * LENGTH;

	return o === "tall"
		? {
				x1: across(sigma[0]),
				x2: across(sigma[1]),
				y1: LENGTH - a,
				y2: LENGTH - a,
			}
		: {
				y1: BREADTH - across(sigma[0]),
				y2: BREADTH - across(sigma[1]),
				x1: a,
				x2: a,
			};
}

function Drawing({ figure, o }: { figure: Figure; o: Orientation }) {
	const { top } = figure;
	const size =
		o === "tall" ? `0 0 ${BREADTH} ${LENGTH}` : `0 0 ${LENGTH} ${BREADTH}`;

	return (
		<svg
			className={`ns-strip-svg ns-strip-svg--${o}`}
			viewBox={size}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<rect className="ns-strip-field" {...rect(o, [0, 1], [0, top], top)} />
			{figure.bands.map((band) => (
				<rect
					key={band.from}
					className="ns-strip-density"
					{...rect(
						o,
						[0.5 - BAND * band.weight, 0.5],
						[band.from, band.to],
						top,
					)}
				/>
			))}
			{figure.scanning ? (
				<rect
					className="ns-strip-scan"
					{...rect(
						o,
						[0.5 - TICK, 0.5 + TICK],
						[figure.scanning.from, figure.scanning.to],
						top,
					)}
				/>
			) : null}
			<line className="ns-strip-edge" {...segmentAlong(o, 0, top)} />
			<line className="ns-strip-edge" {...segmentAlong(o, 1, top)} />
			<line className="ns-strip-critical" {...segmentAlong(o, 0.5, top)} />
			{figure.zeros.map((t) => (
				<line
					key={t}
					className="ns-strip-zero"
					{...segment(o, [0.5 - TICK, 0.5 + TICK], t, top)}
				/>
			))}
			{figure.pairs.map(([a, b]) => (
				<rect
					key={a}
					className="ns-strip-pair"
					{...rect(o, [0.5 - 2 * TICK, 0.5 - TICK], [a, b], top)}
				/>
			))}
			{figure.boxes.map((box) => (
				<rect
					key={boxKey(box)}
					className="ns-strip-box"
					data-live={box.live || undefined}
					data-found={
						box.found === null ? "unresolved" : box.found > 0 ? "zero" : "none"
					}
					{...rect(o, box.sigma, [box.from, box.to], top)}
				/>
			))}
			{figure.frontier > 0 ? (
				<line
					className="ns-strip-frontier"
					{...segment(
						o,
						[SIGMA_MIN, SIGMA_MIN + SIGMA_SPAN],
						figure.frontier,
						top,
					)}
				/>
			) : null}
		</svg>
	);
}

function segmentAlong(o: Orientation, sigma: number, top: number) {
	const b = across(sigma);
	const a = along(top, top) * LENGTH;

	return o === "tall"
		? { x1: b, x2: b, y1: LENGTH, y2: LENGTH - a }
		: { y1: BREADTH - b, y2: BREADTH - b, x1: 0, x2: a };
}

export function StripView({
	figure,
	zeros,
}: {
	figure: Figure;
	zeros: number;
}) {
	const searched = figure.boxes.filter((b) => !b.live).length;

	const summary =
		zeros > 0
			? `${count(zeros)} zeros located, every one on the critical line up to t = ${count(figure.frontier)}. ${searched} rectangles searched off the line.`
			: "No zeros located yet.";

	return (
		<figure className="ns-strip">
			<div className="ns-strip-plot" role="img" aria-label={summary}>
				<Drawing figure={figure} o="tall" />
				<Drawing figure={figure} o="wide" />
				{figure.ticks.map((t, i) => (
					<span
						key={t}
						className="ns-strip-tick"
						data-edge={
							i === 0
								? "start"
								: i === figure.ticks.length - 1
									? "end"
									: undefined
						}
						style={{ "--at": along(t, figure.top) } as React.CSSProperties}
					>
						{count(t)}
					</span>
				))}
				{figure.frontier > 0 ? (
					<span
						className="ns-strip-frontier-label"
						style={
							{
								"--at": along(figure.frontier, figure.top),
							} as React.CSSProperties
						}
					>
						t = {count(figure.frontier)}
					</span>
				) : null}
			</div>
			<figcaption className="ns-strip-legend">
				<span data-mark="critical">Re s = ½</span>
				<span data-mark="zero">a zero</span>
				<span data-mark="frontier">verified up to here</span>
				<span data-mark="box">searched, empty</span>
				<span data-mark="pair">closest pair</span>
			</figcaption>
		</figure>
	);
}
