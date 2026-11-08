import { pct, signed } from "./facts";

export function Bar({
	label,
	value,
	tone,
}: {
	label: string;
	value: number | null;
	tone: "agree" | "lie" | "read";
}) {
	return (
		<span className="kn-bar" data-tone={tone}>
			<span className="kn-bar__label">{label}</span>
			<span className="kn-bar__track">
				<span
					className="kn-bar__fill"
					style={{ transform: `scaleX(${value ?? 0})` }}
				/>
			</span>
			<span className="kn-bar__value">{value === null ? "" : pct(value)}</span>
		</span>
	);
}

const LOW = -0.3;
const HIGH = 1;

const place = (v: number) =>
	(Math.min(HIGH, Math.max(LOW, v)) - LOW) / (HIGH - LOW);

export function Gauge({
	score,
	threshold,
	label,
}: {
	score: number | null;
	threshold: number;
	label: string;
}) {
	const family = score !== null && score > threshold;

	return (
		<span
			className="kn-gauge"
			data-family={family ? "" : undefined}
			role="img"
			aria-label={`${label}: ${score === null ? "not run" : signed(score)}`}
		>
			<span className="kn-gauge__track">
				<span
					className="kn-gauge__zero"
					style={{ left: `${place(0) * 100}%` }}
				/>
				<span
					className="kn-gauge__line"
					style={{ left: `${place(threshold) * 100}%` }}
				/>
				<span
					className="kn-gauge__needle"
					style={{
						transform: `translateX(${place(score ?? 0) * 100}cqw)`,
						opacity: score === null ? 0 : 1,
					}}
				/>
			</span>
			<span className="kn-gauge__value">
				{score === null ? " " : signed(score)}
			</span>
		</span>
	);
}

export function Trace({
	history,
	steps,
	threshold,
}: {
	history: { step: number; value: number }[];
	steps: number;
	threshold: number;
}) {
	const px = (s: number) => (s / steps) * 100;
	const py = (v: number) => 100 - place(v) * 100;
	const points = history.map((h) => `${px(h.step)},${py(h.value)}`).join(" ");

	return (
		<svg
			className="kn-trace"
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<line x1="0" x2="100" y1={py(0)} y2={py(0)} className="kn-trace__zero" />
			<line
				x1="0"
				x2="100"
				y1={py(threshold)}
				y2={py(threshold)}
				className="kn-trace__line"
			/>
			{history.length > 1 ? (
				<polyline points={points} className="kn-trace__path" />
			) : null}
		</svg>
	);
}
