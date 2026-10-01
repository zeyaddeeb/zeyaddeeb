"use client";

import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { sunAt } from "./ephemeris";
import {
	END_YEAR,
	formatDate,
	formatMoment,
	instruments,
	LAUNCH_WATTS,
	LAUNCH_YEAR,
	milestones,
	moments,
	nearest,
	offParts,
	watts,
	wattsPerYear,
	yearNow,
	yearOf,
} from "./instruments";
import type { PartId } from "./model";
import { ModelView, type Pose } from "./model-view";

const SPAN = END_YEAR - LAUNCH_YEAR;
const AXIS = [1980, 1990, 2000, 2010, 2020, 2030];
const STACKED =
	"(max-width: 760px), (max-width: 1099px) and (orientation: portrait)";
const SLOP = 10;
const REACH = 1.5;
const TAU_STACKED = 0.25;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const at = (year: number) => clamp((year - LAUNCH_YEAR) / SPAN);
const smooth = (t: number) => t * t * (3 - 2 * t);
const minus = (n: number) => `−${n.toFixed(1)}`;
const fit = (v: string | number, n: number) => {
	const text = String(v);

	return {
		text: text.padStart(n, "\u2007"),
		style: { "--short": Math.max(0, n - text.length) } as CSSProperties,
	};
};

const rows = instruments.map((i) => ({
	...i,
	end: i.off ? yearOf(i.off) : null,
}));

interface Mark {
	key: string;
	label: string;
	year: number;
	when: string;
	approx?: boolean;
}

const byYear = (a: Mark, b: Mark) => a.year - b.year;

const fixed: Mark[] = moments.map((m) => ({
	key: m.date,
	label: m.label,
	year: yearOf(m.date),
	when: formatMoment(m),
	approx: m.approx,
}));

const events: Mark[] = milestones.map((m) => ({
	...m,
	key: `${m.year}-${m.label}`,
}));

const FRAMES: Record<
	"wide" | "stacked",
	Omit<Pose, "off" | "heat" | "focus">
> = {
	wide: { yaw: -0.62, pitch: 0.35, zoom: 0.96, x: 0.6, y: 0.6 },
	stacked: { yaw: -0.62, pitch: 0.3, zoom: 1.1, x: 0.5, y: 0.52 },
};

function closest(year: number): PartId | null {
	let best: PartId | null = null;
	let gap = REACH;

	for (const r of rows) {
		if (r.end === null) continue;

		const d = Math.abs(r.end - year);

		if (d < gap) {
			gap = d;
			best = r.part;
		}
	}

	return best;
}

export function Power({ now }: { now: number }) {
	const today = useMemo(() => yearNow(now), [now]);
	const [year, setYear] = useState(LAUNCH_YEAR);
	const [manual, setManual] = useState(false);
	const [engaged, setEngaged] = useState(false);
	const [hover, setHover] = useState<PartId | null>(null);
	const [stacked, setStacked] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const stick = useRef<HTMLDivElement>(null);
	const scale = useRef<HTMLSpanElement>(null);
	const held = useRef(false);
	const todayRef = useRef(today);
	const follow = useRef<() => void>(() => {});

	const drag = useRef<{
		id: number;
		x: number;
		y: number;
		live: boolean;
	} | null>(null);

	const dwell = useRef(0);

	const point = (part: PartId | null) => {
		window.clearTimeout(dwell.current);
		dwell.current = window.setTimeout(() => setHover(part), 120);
	};

	useEffect(() => () => window.clearTimeout(dwell.current), []);

	useEffect(() => {
		todayRef.current = today;
		follow.current();
	}, [today]);

	useEffect(() => {
		const mq = window.matchMedia(STACKED);
		const sync = () => setStacked(mq.matches);

		sync();
		mq.addEventListener("change", sync);

		return () => mq.removeEventListener("change", sync);
	}, []);

	useEffect(() => {
		const el = root.current;
		const st = stick.current;

		if (!el || !st) return;

		const narrow = window.matchMedia(STACKED);
		const still = window.matchMedia("(prefers-reduced-motion: reduce)");
		let frame = 0;
		let top = 0;
		let shown: number | null = null;
		let last = 0;

		const measure = () => {
			top = Number.parseFloat(getComputedStyle(st).top) || 0;
		};

		const apply = (now = performance.now()) => {
			frame = 0;

			if (held.current) {
				shown = null;

				return;
			}

			const r = el.getBoundingClientRect();
			const travel = r.height - st.offsetHeight;
			const p = travel > 0 ? clamp((top - r.top) / travel) : 0;
			const t = smooth(clamp((p - 0.05) / 0.85));
			const target = LAUNCH_YEAR + (todayRef.current - LAUNCH_YEAR) * t;
			const dt = Math.min(0.05, (now - last) / 1000);

			last = now;

			if (shown === null || still.matches || !narrow.matches) shown = target;
			else shown += (target - shown) * (1 - Math.exp(-dt / TAU_STACKED));

			if (Math.abs(target - shown) < 0.002) shown = target;
			else frame = requestAnimationFrame(apply);

			const next = shown;

			setYear((y) => (Math.abs(y - next) < 0.002 ? y : next));
		};

		const queue = () => {
			if (frame) return;

			last = performance.now();
			frame = requestAnimationFrame(apply);
		};

		const resize = () => {
			measure();
			queue();
		};

		follow.current = queue;

		const io = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting || !held.current) return;

			held.current = false;
			setManual(false);
			queue();
		});

		measure();
		apply();
		io.observe(el);
		window.addEventListener("scroll", queue, { passive: true });
		window.addEventListener("resize", resize);

		return () => {
			cancelAnimationFrame(frame);
			follow.current = () => {};
			io.disconnect();
			window.removeEventListener("scroll", queue);
			window.removeEventListener("resize", resize);
		};
	}, []);

	const take = (next: number) => {
		held.current = true;
		setManual(true);
		setYear(clamp(next, LAUNCH_YEAR, END_YEAR));
	};

	const yearAt = (clientX: number) => {
		const r = scale.current?.getBoundingClientRect();

		if (!r || r.width === 0) return null;

		return {
			year: LAUNCH_YEAR + clamp((clientX - r.left) / r.width) * SPAN,
			left: r.left,
		};
	};

	const down = (e: PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;

		const hit = yearAt(e.clientX);

		if (!hit) return;

		if (e.pointerType === "touch") {
			drag.current = {
				id: e.pointerId,
				x: e.clientX,
				y: e.clientY,
				live: false,
			};

			return;
		}

		if (e.clientX < hit.left - 12) return;

		e.preventDefault();
		window.clearTimeout(dwell.current);
		setHover(null);
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, live: true };
		setEngaged(true);
		take(hit.year);
	};

	const move = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current;

		if (!d || d.id !== e.pointerId) return;

		if (!d.live) {
			const dx = e.clientX - d.x;
			const dy = e.clientY - d.y;

			if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) {
				drag.current = null;

				return;
			}

			if (Math.abs(dx) < SLOP) return;

			d.live = true;
			e.currentTarget.setPointerCapture(e.pointerId);
			setEngaged(true);
		}

		const hit = yearAt(e.clientX);

		if (hit) take(hit.year);
	};

	const up = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current;

		if (!d || d.id !== e.pointerId) return;

		drag.current = null;

		if (!d.live) {
			const hit = yearAt(e.clientX);

			if (hit) take(hit.year);
		}

		setEngaged(false);
	};

	const cancel = (e: PointerEvent<HTMLDivElement>) => {
		if (drag.current?.id !== e.pointerId) return;

		drag.current = null;
		setEngaged(false);
	};

	const key = (e: KeyboardEvent<HTMLInputElement>) => {
		const steps: Record<string, number> = {
			ArrowRight: 1,
			ArrowUp: 1,
			ArrowLeft: -1,
			ArrowDown: -1,
			PageUp: 10,
			PageDown: -10,
		};

		if (e.key === "Home") take(LAUNCH_YEAR);
		else if (e.key === "End") take(END_YEAR);
		else if (e.key in steps) take(year + steps[e.key]);
		else return;

		e.preventDefault();
	};

	const w = watts(year);
	const whole = Math.floor(year);
	const count = rows.filter((r) => r.end === null || r.end > year).length;
	const future = year > today + 0.001;
	const offKey = [...offParts(year)].sort().join(" ");

	const off = useMemo(
		() => new Set((offKey ? offKey.split(" ") : []) as PartId[]),
		[offKey],
	);

	const heat = Math.round((w / LAUNCH_WATTS) ** 2 * 400) / 400;
	const focus = hover ?? (engaged ? closest(year) : null);
	const frame = FRAMES[stacked ? "stacked" : "wide"];

	const pose = useMemo<Pose>(
		() => ({ ...frame, off, heat, focus }),
		[frame, off, heat, focus],
	);

	const stamp = useMemo<Mark>(
		() => ({
			key: "today",
			label: "Today",
			year: today,
			when: formatDate(new Date(now).toISOString().slice(0, 10)),
		}),
		[now, today],
	);

	const marks = useMemo(() => [...fixed, stamp].sort(byYear), [stamp]);
	const lines = useMemo(() => [...events, stamp].sort(byYear), [stamp]);
	const near = nearest(marks, year, (m) => m.year);
	const line = nearest(lines, year, (m) => m.year);
	const mark = marks[near];
	const spoken = Math.abs(mark.year - year) < 0.5 ? `, ${mark.label}` : "";
	const power = fit(Math.round(w), 3);
	const sun = fit(sunAt(year).toFixed(1), 5);
	const on = fit(count, 2);

	return (
		<div
			className="vg-power"
			ref={root}
			data-manual={manual ? "true" : undefined}
		>
			<div className="vg-power__stick vg-grid" ref={stick}>
				<div className="vg-power__readout">
					<div className="vg-power__when">
						<p className="vg-power__label">{future ? "Forecast" : "Year"}</p>
						<p className="vg-power__year">{whole}</p>
					</div>
					<dl className="vg-power__cells">
						<div className="vg-power__cell">
							<dt className="vg-power__label">Power</dt>
							<dd className="vg-power__value" style={power.style}>
								<span className="vg-power__num">{power.text}</span>
								<span className="vg-unit">W</span>
							</dd>
							<dd className="vg-power__rate">
								{minus(wattsPerYear(year))}
								{" "}W a year
							</dd>
						</div>
						<div className="vg-power__cell" data-cell="sun">
							<dt className="vg-power__label">From the Sun</dt>
							<dd className="vg-power__value" style={sun.style}>
								<span className="vg-power__num">{sun.text}</span>
								<span className="vg-unit">AU</span>
							</dd>
						</div>
						<div className="vg-power__cell">
							<dt className="vg-power__label">
								<span className="vg-power__wide">Instruments on</span>
								<span className="vg-power__narrow">Running</span>
							</dt>
							<dd className="vg-power__value" style={on.style}>
								<span className="vg-power__num">{on.text}</span>
								<span className="vg-unit">of{" "}10</span>
							</dd>
						</div>
					</dl>
				</div>
				<div className="vg-power__stage">
					<ModelView
						pose={pose}
						label={`Voyager 1 in ${whole}, with ${count} of 10 instruments on`}
						className="vg-power__model"
					/>
				</div>
				<div
					className="vg-gantt"
					data-engaged={engaged ? "true" : undefined}
					style={{ "--x": at(year), "--today": at(today) } as CSSProperties}
				>
					<div
						className="vg-gantt__plot"
						onPointerDown={down}
						onPointerMove={move}
						onPointerUp={up}
						onPointerCancel={cancel}
					>
						<div className="vg-gantt__axis">
							<p className="vg-gantt__hint">
								<span className="vg-gantt__wide">Drag the chart</span>
								<span className="vg-gantt__narrow">Drag</span>
							</p>
							<span className="vg-gantt__scale" ref={scale} aria-hidden="true">
								{AXIS.map((y) => (
									<span
										key={y}
										className="vg-gantt__tick"
										data-minor={y % 20 ? "true" : undefined}
										style={{ "--at": at(y) } as CSSProperties}
									>
										{y}
									</span>
								))}
							</span>
						</div>
						<span className="vg-gantt__under" aria-hidden="true">
							<i className="vg-gantt__forecast" />
							<i className="vg-gantt__today" />
						</span>
						<ol className="vg-gantt__rows" aria-label="Instruments">
							{rows.map((r) => {
								const on = r.end === null || r.end > year;
								const end = r.end === null ? 1 : at(r.end);

								return (
									<li
										key={r.id}
										className="vg-gantt__row"
										data-on={on ? "true" : "false"}
										data-hover={hover === r.part ? "true" : undefined}
										onPointerEnter={(e) => {
											if (e.pointerType === "mouse" && !drag.current)
												point(r.part);
										}}
										onPointerLeave={(e) => {
											if (e.pointerType === "mouse") point(null);
										}}
									>
										<span className="vg-gantt__label">
											<i className="vg-gantt__dot" aria-hidden="true" />
											<b className="vg-gantt__code">{r.id}</b>
											<span className="vg-gantt__short" aria-hidden="true">
												{r.short}
											</span>
											<span className="sr-only">
												{`${r.name}, ${r.off ? `switched off ${formatDate(r.off)}` : "still on"}`}
											</span>
										</span>
										<span
											className="vg-gantt__track"
											style={{ "--end": end } as CSSProperties}
											data-open={r.off ? undefined : "true"}
										>
											<span className="vg-gantt__bar" />
											{r.off ? (
												<span
													className="vg-gantt__date"
													data-flip={end > 0.6 ? "true" : undefined}
													aria-hidden="true"
												>
													{formatDate(r.off)}
												</span>
											) : null}
										</span>
									</li>
								);
							})}
						</ol>
						<div className="vg-gantt__moments" aria-hidden="true">
							<span className="vg-gantt__marks">
								{marks.map((m, i) => (
									<i
										key={m.key}
										className="vg-gantt__mark"
										data-past={m.year <= year ? "true" : undefined}
										data-near={i === near ? "true" : undefined}
										data-approx={m.approx ? "true" : undefined}
										style={{ "--at": at(m.year) } as CSSProperties}
									/>
								))}
								{marks.map((m, i) => (
									<span
										key={m.key}
										className="vg-gantt__moment"
										data-near={i === near ? "true" : undefined}
										style={{ "--at": at(m.year) } as CSSProperties}
									>
										<b className="vg-gantt__name">{m.label}</b>
										<span className="vg-gantt__when">{m.when}</span>
									</span>
								))}
							</span>
						</div>
						<p className="vg-gantt__line" aria-hidden="true">
							{lines.map((m, i) => (
								<span
									key={m.key}
									className="vg-gantt__event"
									data-near={i === line ? "true" : undefined}
								>
									<span className="vg-gantt__when">{m.when}</span>
									{m.label}
								</span>
							))}
						</p>
						<input
							className="vg-gantt__input"
							type="range"
							min={LAUNCH_YEAR}
							max={END_YEAR}
							step={0.01}
							value={year}
							aria-label="Mission year"
							aria-valuetext={`${whole}, ${Math.round(w)} watts, ${count} of 10 instruments on${spoken}`}
							onKeyDown={key}
							onChange={(e) => take(Number(e.target.value))}
							onFocus={(e) => {
								if (e.currentTarget.matches(":focus-visible")) setEngaged(true);
							}}
							onBlur={() => {
								if (!drag.current) setEngaged(false);
							}}
						/>
						<span className="vg-gantt__over" aria-hidden="true">
							<i className="vg-gantt__cursor" />
							<i className="vg-gantt__knob" />
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
