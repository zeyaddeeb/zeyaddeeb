"use client";

import {
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useRef,
} from "react";
import { ControlButton } from "@/components/control-button";
import {
	celsius,
	clampHeater,
	HEATER_MAX,
	HEATER_MIN,
	kelvin,
	kelvinPerTurn,
	needleTurn,
	wobbleDegrees,
	ZOOMS,
} from "./model";

const SWING = 58;

const DEG_PER_PX = 1.2;
const STEP_DEG = 360 / 25;
const HOLD_MS = 340;
const REPEAT_MS = 70;

function Step({
	sign,
	label,
	onStep,
}: {
	sign: 1 | -1;
	label: string;
	onStep: (sign: 1 | -1) => void;
}) {
	const timer = useRef(0);
	const stop = () => {
		window.clearTimeout(timer.current);
		window.clearInterval(timer.current);
	};

	useEffect(() => stop, []);

	return (
		<button
			type="button"
			className="hc-step"
			aria-label={label}
			onPointerDown={(e) => {
				e.currentTarget.setPointerCapture(e.pointerId);
				onStep(sign);
				stop();
				timer.current = window.setTimeout(() => {
					timer.current = window.setInterval(() => onStep(sign), REPEAT_MS);
				}, HOLD_MS);
			}}
			onPointerUp={stop}
			onPointerCancel={stop}
			onLostPointerCapture={stop}
			onClick={(e) => {
				if (e.detail === 0) onStep(sign);
			}}
		>
			<svg viewBox="0 0 16 16" aria-hidden="true">
				<path d={sign > 0 ? "M3 8 H13 M8 3 V13" : "M3 8 H13"} />
			</svg>
		</button>
	);
}

export function Dial({
	heater,
	level,
	onHeater,
}: {
	heater: number;
	level: number;
	onHeater: (t: number) => void;
}) {
	const knob = useRef<SVGGElement>(null);
	const turn = useRef(0);
	const grip = useRef<{ x: number; y: number } | null>(null);
	const now = useRef({ heater, level });

	now.current = { heater, level };

	const spin = (deg: number) => {
		turn.current += deg;
		knob.current?.setAttribute(
			"transform",
			`rotate(${turn.current.toFixed(2)} 80 80)`,
		);

		const { heater: t, level: l } = now.current;
		const next = clampHeater(t + (deg / 360) * kelvinPerTurn(l));

		now.current = { heater: next, level: l };
		onHeater(next);
	};

	const down = (e: PointerEvent<HTMLDivElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		grip.current = { x: e.clientX, y: e.clientY };
	};

	const move = (e: PointerEvent<HTMLDivElement>) => {
		const g = grip.current;

		if (!g) return;

		const delta = e.clientX - g.x + (g.y - e.clientY);

		grip.current = { x: e.clientX, y: e.clientY };
		if (delta) spin(delta * DEG_PER_PX);
	};

	const up = () => {
		grip.current = null;
	};

	const key = (e: KeyboardEvent<HTMLDivElement>) => {
		const steps: Record<string, number> = {
			ArrowUp: STEP_DEG,
			ArrowRight: STEP_DEG,
			ArrowDown: -STEP_DEG,
			ArrowLeft: -STEP_DEG,
			PageUp: 90,
			PageDown: -90,
		};
		const step = steps[e.key];

		if (step === undefined) return;

		e.preventDefault();
		spin(step);
	};

	const ticks = Array.from({ length: 60 }, (_, i) => i * 6);

	return (
		<div className="hc-tuner">
			<Step sign={-1} label="Cooler" onStep={(d) => spin(d * STEP_DEG)} />
			<div
				className="hc-dial"
				role="slider"
				tabIndex={0}
				aria-label="Heater"
				aria-valuemin={HEATER_MIN}
				aria-valuemax={HEATER_MAX}
				aria-valuenow={Number(heater.toFixed(6))}
				aria-valuetext={`${kelvin(heater, level)}, ${celsius(heater, level)}`}
				onPointerDown={down}
				onPointerMove={move}
				onPointerUp={up}
				onPointerCancel={up}
				onKeyDown={key}
			>
				<svg viewBox="0 0 160 160" aria-hidden="true">
					<circle className="hc-dial__rim" cx="80" cy="80" r="74" />
					<g ref={knob} transform={`rotate(${turn.current} 80 80)`}>
						{ticks.map((t) => (
							<line
								key={t}
								className="hc-dial__tick"
								x1="80"
								y1="14"
								x2="80"
								y2={t % 90 === 0 ? 26 : 21}
								transform={`rotate(${t} 80 80)`}
							/>
						))}
						<circle className="hc-dial__grip" cx="80" cy="38" r="7" />
					</g>
					<circle className="hc-dial__hub" cx="80" cy="80" r="20" />
				</svg>
			</div>
			<Step sign={1} label="Warmer" onStep={(d) => spin(d * STEP_DEG)} />
		</div>
	);
}

export function Gauge({
	cx,
	cy,
	ring,
	gap,
	level,
	beat,
	still,
	matched,
}: {
	cx: number;
	cy: number;
	ring: number;
	gap: number;
	level: number;
	beat: number;
	still: boolean;
	matched: boolean;
}) {
	const hand = useRef<SVGGElement>(null);
	const live = useRef({ gap, level, beat, cx, cy });

	live.current = { gap, level, beat, cx, cy };

	useEffect(() => {
		const el = hand.current;

		if (!el) return;

		const place = (wobble: number) => {
			const { gap: g, level: l, cx: x, cy: y } = live.current;
			const deg = needleTurn(g, l) * SWING + wobble;

			el.setAttribute(
				"transform",
				`rotate(${deg.toFixed(2)} ${x.toFixed(1)} ${y.toFixed(1)})`,
			);
		};

		if (still || beat <= 0) {
			place(0);
			return;
		}

		let frame = 0;
		const start = performance.now();
		const tick = (t: number) => {
			const { beat: hz } = live.current;
			const phase = ((t - start) / 1000) * hz * Math.PI * 2;

			place(wobbleDegrees(hz) * Math.sin(phase));
			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, [beat > 0, still]);

	useEffect(() => {
		if (still || beat <= 0) {
			hand.current?.setAttribute(
				"transform",
				`rotate(${(needleTurn(gap, level) * SWING).toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})`,
			);
		}
	}, [gap, level, beat, still, cx, cy]);

	const r = Math.max(ring + 40, 74);
	const a = (SWING * Math.PI) / 180;
	const at = (deg: number, rad: number) => {
		const t = (deg * Math.PI) / 180;

		return [
			(cx + rad * Math.sin(t)).toFixed(1),
			(cy - rad * Math.cos(t)).toFixed(1),
		];
	};
	const [x0, y0] = at(-SWING, r);
	const [x1, y1] = at(SWING, r);
	const ticks = [-1, -0.5, 0, 0.5, 1];
	const endY = (cy - r * Math.cos(a) + 30).toFixed(1);

	return (
		<g className="hc-gauge" data-matched={matched}>
			<path
				className="hc-gauge__shade"
				d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
			/>
			<path
				className="hc-gauge__arc"
				d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
			/>
			{ticks.map((t) => {
				const [ax, ay] = at(t * SWING, r - (t === 0 ? 9 : 6));
				const [bx, by] = at(t * SWING, r + (t === 0 ? 9 : 6));

				return (
					<line
						key={t}
						className={t === 0 ? "hc-gauge__zero" : "hc-gauge__tick"}
						x1={ax}
						y1={ay}
						x2={bx}
						y2={by}
					/>
				);
			})}
			<g ref={hand}>
				<line
					className="hc-gauge__hand"
					x1={cx.toFixed(1)}
					y1={(cy - r + 16).toFixed(1)}
					x2={cx.toFixed(1)}
					y2={(cy - r - 14).toFixed(1)}
				/>
			</g>
			<text
				className="hc-gauge__end"
				x={(cx - r * Math.sin(a) - 10).toFixed(1)}
				y={endY}
				textAnchor="end"
			>
				too warm
			</text>
			<text
				className="hc-gauge__end"
				x={(cx + r * Math.sin(a) + 10).toFixed(1)}
				y={endY}
			>
				too cold
			</text>
			<text
				className="hc-gauge__zoom"
				x={cx.toFixed(1)}
				y={(cy - r - 24).toFixed(1)}
				textAnchor="middle"
			>
				{ZOOMS[level]}
			</text>
		</g>
	);
}

export function Readout({ heater, level }: { heater: number; level: number }) {
	return (
		<div className="hc-read">
			<span className="hc-eyebrow">Heater</span>
			<span className="hc-read__k">{kelvin(heater, level)}</span>
			<span className="hc-read__c">{celsius(heater, level)}</span>
		</div>
	);
}

export function HearIt({
	on,
	onToggle,
}: {
	on: boolean;
	onToggle: () => void;
}) {
	return (
		<ControlButton pressed={on} aria-pressed={on} onClick={onToggle}>
			<span className="hc-hear">
				<svg viewBox="0 0 16 16" aria-hidden="true">
					<path d="M2 6 H5 L9 2.5 V13.5 L5 10 H2 Z" />
					{on ? (
						<path className="hc-hear__wave" d="M11.5 5 Q13.5 8 11.5 11" />
					) : null}
				</svg>
				Hear it
			</span>
		</ControlButton>
	);
}
