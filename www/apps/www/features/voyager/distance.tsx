"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { AU_KM, C_KM_S, DAY_S, fix, grouped } from "./ephemeris";
import { LIGHT_DAY } from "./facts";
import { openUplink, type Sent, useSent } from "./uplink";
import "./distance-ladder.css";

const REFERENCE = Date.UTC(2026, 8, 28);
const NB = " ";
const MAX = Math.log10(DAY_S * 2);
const FLAG = 6;
const CLEAR = 20;
const HUSH = 16;
const STEP = 26;
const PHONE_RAIL = 420;
const DESKTOP = 1256;

const au = (n: number) => (n * AU_KM) / C_KM_S;
const place = (s: number) =>
	Math.min(1, Math.max(0, Math.log10(Math.max(1, s)) / MAX));
const two = (n: number) => String(Math.floor(n)).padStart(2, "0");

function span(seconds: number, unit = "") {
	if (seconds < 10) return `${seconds.toFixed(1)}${unit}s`;
	const t = Math.floor(seconds);
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	if (h > 0) return `${h}${unit}h${NB}${m}${unit}m`;
	if (m >= 10) return `${m}${unit}m`;
	if (m > 0) return `${m}${unit}m${NB}${t % 60}${unit}s`;
	return `${t}${unit}s`;
}

function clock(seconds: number, unit = "") {
	const t = Math.max(0, Math.floor(seconds));
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	if (h > 0) return `${h}${unit}h${NB}${m}${unit}m`;
	if (m > 0) return `${m}${unit}m${NB}${t % 60}${unit}s`;
	return `${t}${unit}s`;
}

const MOMENT = `${new Date(LIGHT_DAY)
	.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	})
	.replace(" ", NB)} at ${new Date(LIGHT_DAY).toLocaleTimeString("en-US", {
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
	timeZone: "UTC",
})}${NB}UTC`;

const weekday = (ms: number) =>
	new Date(ms).toLocaleString("en-US", {
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});

const marks = [
	{ id: "moon", label: "Moon", s: 1.28 },
	{ id: "sun", label: "Sun", s: au(1) },
	{ id: "jupiter", label: "Jupiter", s: au(5.2) },
	{ id: "saturn", label: "Saturn", s: au(9.58) },
	{ id: "neptune", label: "Neptune", s: au(30.07) },
	{ id: "heliopause", label: "Heliopause, 2012", s: au(121.6) },
].map((m) => ({ ...m, x: place(m.s), time: span(m.s) }));

const ticks = [
	{ id: "second", label: "1 second", s: 1 },
	{ id: "minute", label: "1 minute", s: 60 },
	{ id: "hour", label: "1 hour", s: 3600 },
	{ id: "day", label: "1 day", s: DAY_S },
].map((t) => ({ ...t, x: place(t.s) }));

interface Stack {
	rows: number[];
	ends: number[];
}

function stack(width: number, xs: number[], ws: number[]): Stack {
	const n = xs.length;
	let best: Stack = { rows: [], ends: [] };
	let low = Number.POSITIVE_INFINITY;
	const l = new Array<number>(n);
	const r = new Array<number>(n);
	const rows = new Array<number>(n);
	const ends = new Array<number>(n);
	for (let code = 0; code < 4 ** n; code++) {
		let cost = 0;
		for (let i = 0; i < n; i++) {
			const o = Math.floor(code / 4 ** i) % 4;
			rows[i] = o % 2;
			ends[i] = o >> 1;
			l[i] = ends[i] ? xs[i] - ws[i] - FLAG : xs[i];
			r[i] = ends[i] ? xs[i] : xs[i] + ws[i] + FLAG;
			cost += rows[i] + ends[i] * 2;
			if (l[i] < 0) cost += 1000 - l[i];
			if (r[i] > width) cost += 1000 + r[i] - width;
		}
		for (let i = 0; i < n && cost < low; i++) {
			for (let j = i + 1; j < n; j++) {
				if (rows[i] === rows[j]) {
					const over = Math.min(r[i], r[j]) + CLEAR - Math.max(l[i], l[j]);
					if (over > 0) cost += 1000 + over;
				} else {
					const a = rows[i] ? i : j;
					const b = rows[i] ? j : i;
					if (xs[a] > l[b] - 4 && xs[a] < r[b] + 4) cost += 1000;
				}
			}
		}
		if (cost < low) {
			low = cost;
			best = { rows: [...rows], ends: [...ends] };
		}
	}
	return best;
}

interface Line {
	ends: number[];
	hidden: number[];
	short: boolean;
	nudge: number;
}

function line(
	width: number,
	ws: number[],
	here: { x: number; long: number; short: number },
): Line {
	const xs = ticks.map((t) => t.x * width);
	const nudge = Math.min(
		Math.max(0, here.x - xs[3]),
		width - (xs[3] + FLAG + ws[3]),
	);
	let best: Line = {
		ends: [0, 0, 0, 0],
		hidden: [0, 0, 0, 0],
		short: false,
		nudge,
	};
	let low = Number.POSITIVE_INFINITY;
	for (let code = 0; code < 18; code++) {
		const a = code % 3;
		const b = Math.floor(code / 3) % 3;
		const short = code >= 9;
		const boxes: [number, number][] = [
			[0, ws[0] + FLAG],
			[xs[3], xs[3] + FLAG + ws[3] + nudge],
			[here.x - FLAG - (short ? here.short : here.long), here.x],
		];
		let cost = short ? 20 : 0;
		for (const [k, o] of [
			[1, a],
			[2, b],
		]) {
			if (o === 2) {
				cost += 500;
				continue;
			}
			cost += o * 2;
			boxes.push(
				o ? [xs[k] - FLAG - ws[k], xs[k]] : [xs[k], xs[k] + FLAG + ws[k]],
			);
		}
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const over =
					Math.min(boxes[i][1], boxes[j][1]) +
					CLEAR -
					Math.max(boxes[i][0], boxes[j][0]);
				if (over > 0) cost += 1000 + over;
			}
		}
		if (cost < low) {
			low = cost;
			best = {
				ends: [0, a === 1 ? 1 : 0, b === 1 ? 1 : 0, 0],
				hidden: [0, a === 2 ? 1 : 0, b === 2 ? 1 : 0, 0],
				short,
				nudge,
			};
		}
	}
	return best;
}

function relax(ys: number[]) {
	const out = [...ys];
	for (let i = out.length - 2; i > 0; i--)
		out[i] = Math.min(out[i], out[i + 1] - STEP);
	for (let i = 1; i < out.length - 1; i++)
		out[i] = Math.max(out[i], out[i - 1] + STEP);
	return out.map((y, i) => Math.round(y - ys[i]));
}

const first = fix(REFERENCE);
const HERE = place(first.lightSeconds);
const jost = (s: string) => s.length * 6.9;
const mono = (s: string) => s.length * 7.6;
const PRESET = stack(
	DESKTOP,
	marks.map((m) => m.x * DESKTOP),
	marks.map((m) => Math.max(jost(m.label), mono(m.time))),
);
const TOP = line(
	DESKTOP,
	ticks.map((t) => mono(t.label)),
	{
		x: HERE * DESKTOP,
		long: jost("Voyager 1 today") + 8 + mono(span(first.lightSeconds)),
		short: jost("Voyager 1") + 8 + mono(span(first.lightSeconds)),
	},
);
const DROP = relax(
	[0, ...marks.map((m) => m.x), HERE].map((x) => x * PHONE_RAIL),
).slice(1);

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function countdown(ms: number) {
	const s = Math.floor(Math.abs(LIGHT_DAY - ms) / 1000);
	return {
		d: Math.floor(s / DAY_S),
		parts: [
			String(Math.floor(s / DAY_S)).padStart(2, "0"),
			two((s % DAY_S) / 3600),
			two((s % 3600) / 60),
			two(s % 60),
		],
	};
}

const units = ["days", "hours", "minutes", "seconds"];

const phases = ["idle", "flight", "arrived"] as const;

const pills = {
	idle: "Send it a command",
	flight: "Your command, in flight",
	arrived: "Your command arrived",
};

const put = (el: Element | null, text: string) => {
	if (!el) return;
	const node = el.firstChild;
	if (node?.nodeType === Node.TEXT_NODE && !node.nextSibling) {
		if (node.nodeValue !== text) node.nodeValue = text;
	} else if (el.textContent !== text) el.textContent = text;
};

function arrival(sent: Sent) {
	return sent.at + sent.light * 1000;
}

export function Distance() {
	const sent = useSent();
	const root = useRef<HTMLDivElement>(null);
	const plot = useRef<HTMLDivElement>(null);
	const digits = useRef<(HTMLSpanElement | null)[]>([]);
	const here = useRef<HTMLDivElement>(null);
	const hereTime = useRef<HTMLSpanElement>(null);
	const today = useRef<HTMLSpanElement>(null);
	const eta = useRef<HTMLElement>(null);
	const left = useRef<HTMLElement>(null);
	const photon = useRef<HTMLDivElement>(null);
	const home = useRef<HTMLSpanElement>(null);
	const photonName = useRef<HTMLSpanElement>(null);
	const photonTime = useRef<HTMLSpanElement>(null);
	const sun = useRef<HTMLSpanElement>(null);
	const sunSpeed = useRef<HTMLSpanElement>(null);
	const away = useRef<HTMLSpanElement>(null);
	const flags = useRef<Record<string, boolean>>({});
	const live = useRef(sent);
	live.current = sent;
	const [crossed, setCrossed] = useState(REFERENCE >= LIGHT_DAY);
	const [wide, setWide] = useState(false);
	const [closing, setClosing] = useState(first.kmPerS < 0);
	const [, setLanded] = useState(false);
	const arrived = sent ? Date.now() >= arrival(sent) : false;
	const phase = sent ? (arrived ? "arrived" : "flight") : "idle";
	const start = countdown(REFERENCE);

	useEffect(() => {
		const el = root.current;
		if (!el) return;
		let frame = 0;
		let last = 0;
		let on = false;
		const narrow = window.matchMedia("(max-width: 760px)");
		const flip = (
			key: string,
			value: boolean,
			set: (next: boolean) => void,
		) => {
			if (flags.current[key] === value) return;
			flags.current[key] = value;
			set(value);
		};
		const tick = () => {
			const ms = Date.now();
			const f = fix(ms);
			const c = countdown(ms);
			c.parts.forEach((p, i) => {
				put(digits.current[i], p);
			});
			flip("crossed", ms >= LIGHT_DAY, setCrossed);
			flip("wide", c.d >= 100, setWide);
			flip("closing", f.kmPerS < 0, setClosing);
			const p = place(f.lightSeconds);
			here.current?.style.setProperty("--p", p.toFixed(5));
			plot.current?.style.setProperty("--v", p.toFixed(5));
			put(hereTime.current, span(f.lightSeconds));
			put(sun.current, (f.sunKm / AU_KM).toFixed(3));
			put(sunSpeed.current, grouped(f.sunKmPerS * 3600));
			const speed = Math.abs(f.kmPerS).toFixed(2);
			put(away.current, speed);
			away.current?.parentElement?.style.setProperty(
				"--ch",
				String(speed.length - 0.5),
			);
			const s = live.current;
			const earth = home.current;
			if (!s) {
				earth?.toggleAttribute("data-quiet", false);
				flip("landed", false, setLanded);
				put(eta.current, clock(f.lightSeconds, NB));
				return;
			}
			const end = arrival(s);
			const done = ms >= end;
			flip("landed", done, setLanded);
			put(eta.current, clock(f.lightSeconds, NB));
			if (!done) put(left.current, clock((end - ms) / 1000, NB));
			const dot = photon.current;
			if (!dot) return;
			const e = (ms - s.at) / 1000;
			dot.style.setProperty("--p", place(Math.min(e, s.light)).toFixed(5));
			dot.dataset.arrived = done ? "true" : "false";
			put(photonName.current, done ? "Arrived" : "Your command");
			put(photonTime.current, done ? weekday(end) : `${clock(e)} out`);
			const box = plot.current;
			const label = photonName.current?.parentElement;
			if (box && label && earth) {
				const x = place(Math.min(e, s.light)) * box.clientWidth;
				const width = earth.offsetWidth;
				const trail = x - FLAG - label.offsetWidth >= width + FLAG + CLEAR;
				dot.style.setProperty("--end", trail ? "1" : "0");
				earth.toggleAttribute(
					"data-quiet",
					!narrow.matches && !trail && x + 2 < FLAG + width + HUSH,
				);
			}
		};
		const loop = (t: number) => {
			if (!on) return;
			frame = requestAnimationFrame(loop);
			if (t - last < 100) return;
			last = t;
			tick();
		};
		const io = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && !on) {
					on = true;
					tick();
					frame = requestAnimationFrame(loop);
				} else if (!entry.isIntersecting) {
					on = false;
					cancelAnimationFrame(frame);
				}
			},
			{ rootMargin: "100% 0px" },
		);
		io.observe(el);
		tick();
		return () => {
			on = false;
			cancelAnimationFrame(frame);
			io.disconnect();
		};
	}, [sent]);

	useEffect(() => {
		const box = plot.current;
		if (!box) return;
		const phone = window.matchMedia("(max-width: 760px)");
		const fit = () => {
			if (phone.matches) {
				if (today.current) today.current.hidden = false;
				return;
			}
			const width = box.clientWidth;
			const items = [...box.querySelectorAll<HTMLElement>(".vg-mark")];
			const ws = items.map(
				(li) =>
					li.querySelector<HTMLElement>(".vg-mark__label")?.offsetWidth ?? 0,
			);
			const fitted = stack(
				width,
				marks.map((m) => m.x * width),
				ws,
			);
			items.forEach((li, i) => {
				li.style.setProperty("--row", String(fitted.rows[i]));
				li.style.setProperty("--end", String(fitted.ends[i]));
				li.style.setProperty("--align", fitted.ends[i] ? "right" : "left");
			});
			const tickEls = [...box.querySelectorAll<HTMLElement>(".vg-tick")];
			const label = here.current?.querySelector<HTMLElement>(
				".vg-ladder__here-label",
			);
			const word = today.current;
			if (!label || !word) return;
			word.hidden = false;
			const full = label.offsetWidth;
			const top = line(
				width,
				tickEls.map(
					(li) =>
						li.querySelector<HTMLElement>(".vg-tick__label")?.offsetWidth ?? 0,
				),
				{
					x: place(fix(Date.now()).lightSeconds) * width,
					long: full,
					short: full - word.offsetWidth,
				},
			);
			word.hidden = top.short;
			tickEls.forEach((li, i) => {
				li.style.setProperty("--end", String(top.ends[i]));
				li.style.setProperty("--show", String(1 - top.hidden[i]));
			});
			tickEls[3]?.style.setProperty("--nudge", `${top.nudge}px`);
		};
		const ro = new ResizeObserver(fit);
		ro.observe(box);
		document.fonts?.ready.then(fit);
		return () => ro.disconnect();
	}, []);

	const land = sent ? weekday(arrival(sent)) : "Tue 12:00 PM";

	return (
		<div className="vg-distance vg-grid" ref={root}>
			<div className="vg-count">
				<p className="vg-eyebrow">
					{crossed ? "Beyond one light-day for" : "One light-day in"}
				</p>
				<p className="vg-count__n" role="timer" data-digits={wide ? "3" : "2"}>
					{start.parts.map((part, i) => (
						<span key={units[i]} className="vg-count__group">
							{i > 0 ? (
								<span className="vg-count__sep" aria-hidden="true">
									:
								</span>
							) : null}
							<span className="vg-count__cell">
								<span
									className="vg-count__v"
									ref={(el) => {
										digits.current[i] = el;
									}}
								>
									{part}
								</span>
								<span className="vg-count__u">{units[i]}</span>
							</span>
						</span>
					))}
				</p>
			</div>
			<p className="vg-distance__when">
				<span className="vg-distance__lead">
					<strong>{MOMENT}</strong>, as{NB}NASA times it.
				</span>{" "}
				A signal sent then {crossed ? "took" : "takes"} a full day to{NB}arrive.
			</p>
			<div className="vg-distance__send">
				<button
					type="button"
					className={`vg-pill vg-distance__pill${phase === "idle" ? "" : " vg-pill--outline"}`}
					onClick={() => openUplink()}
				>
					<span className="vg-distance__swap vg-distance__swap--pill">
						{phases.map((p) => (
							<span
								key={p}
								className="vg-distance__state vg-distance__face"
								data-on={p === phase ? "" : undefined}
								aria-hidden={p === phase ? undefined : true}
							>
								{pills[p]}
								<LifeArrow
									direction="right"
									seed={0}
									active={p === phase ? undefined : false}
								/>
							</span>
						))}
					</span>
				</button>
				<p className="vg-distance__eta vg-distance__swap">
					<span
						className="vg-distance__state"
						data-on={phase === "idle" ? "" : undefined}
						aria-hidden={phase === "idle" ? undefined : true}
					>
						Your bits leave at 16 per second and arrive{NB}in{" "}
						<b ref={eta}>{clock(first.lightSeconds, NB)}</b>.
					</span>
					<span
						className="vg-distance__state"
						data-on={phase === "flight" ? "" : undefined}
						aria-hidden={phase === "flight" ? undefined : true}
					>
						It reaches Voyager{NB}1 at <b>{land}</b>, in{" "}
						<b ref={left}>
							{sent
								? clock((arrival(sent) - Date.now()) / 1000, NB)
								: clock(first.lightSeconds, NB)}
						</b>
						.
					</span>
					<span
						className="vg-distance__state"
						data-on={phase === "arrived" ? "" : undefined}
						aria-hidden={phase === "arrived" ? undefined : true}
					>
						It reached Voyager{NB}1 at <b>{land}</b>. A reply would take as long
						{NB}again.
					</span>
				</p>
			</div>
			<figure className="vg-ladder">
				<div
					className="vg-ladder__plot"
					ref={plot}
					style={{ "--v": HERE.toFixed(5) } as Vars}
				>
					<ol className="vg-ladder__ticks" aria-hidden="true">
						{ticks.map((t, i) => (
							<li
								key={t.id}
								className="vg-tick"
								style={
									{
										"--x": t.x.toFixed(5),
										"--end": TOP.ends[i],
										"--show": 1 - TOP.hidden[i],
										"--nudge": i === 3 ? `${TOP.nudge}px` : "0px",
									} as Vars
								}
							>
								<span className="vg-tick__label">{t.label}</span>
							</li>
						))}
					</ol>
					<div className="vg-ladder__rail" aria-hidden="true">
						<span className="vg-ladder__earth" />
						<span className="vg-ladder__home" ref={home}>
							Earth
						</span>
					</div>
					<ol className="vg-ladder__marks">
						{marks.map((m, i) => (
							<li
								key={m.id}
								className="vg-mark"
								style={
									{
										"--x": m.x.toFixed(5),
										"--row": PRESET.rows[i],
										"--end": PRESET.ends[i],
										"--align": PRESET.ends[i] ? "right" : "left",
										"--dy": `${DROP[i]}px`,
									} as Vars
								}
							>
								<span className="vg-mark__label">
									<span className="vg-mark__name">{m.label}</span>{" "}
									<span className="vg-mark__time">{m.time}</span>
								</span>
							</li>
						))}
					</ol>
					<div
						className="vg-ladder__here"
						ref={here}
						style={{ "--p": HERE.toFixed(5) } as Vars}
					>
						<span className="vg-ladder__dot" />
						<span className="vg-ladder__here-label">
							<span className="vg-mark__name">
								Voyager{NB}1
								<span ref={today} hidden={TOP.short}>
									{" "}
									today
								</span>
							</span>{" "}
							<span className="vg-mark__time" ref={hereTime}>
								{span(first.lightSeconds)}
							</span>
						</span>
					</div>
					{sent ? (
						<div
							className="vg-ladder__photon"
							ref={photon}
							style={{ "--p": "0", "--end": "0" } as Vars}
						>
							<span className="vg-ladder__dot" />
							<span className="vg-ladder__photon-label">
								<span className="vg-mark__name" ref={photonName}>
									Your command
								</span>{" "}
								<span className="vg-mark__time" ref={photonTime} />
							</span>
						</div>
					) : null}
				</div>
				<figcaption className="vg-caption">
					Light time from Earth, on a log scale. Planets at their average{NB}
					distance.
				</figcaption>
			</figure>
			<ul className="vg-tilerow vg-distance__tiles" data-reveal="">
				<li className="vg-tile" data-band="gold">
					<p className="vg-tile__label">From the Sun</p>
					<p className="vg-tile__value">
						<span className="vg-distance__num" style={{ "--ch": 6.5 } as Vars}>
							<span ref={sun}>{(first.sunKm / AU_KM).toFixed(3)}</span>
						</span>
						<span className="vg-unit">AU</span>
					</p>
					<p className="vg-tile__note">Earth sits at 1.</p>
				</li>
				<li className="vg-tile" data-band="gold">
					<p className="vg-tile__label">Speed from the Sun</p>
					<p className="vg-tile__value">
						<span className="vg-distance__num" style={{ "--ch": 5.5 } as Vars}>
							<span ref={sunSpeed}>{grouped(first.sunKmPerS * 3600)}</span>
						</span>
						<span className="vg-unit">km/h</span>
					</p>
					<p className="vg-tile__note">About 3.6 AU a year.</p>
				</li>
				<li className="vg-tile" data-band="blue">
					<p className="vg-tile__label">
						{closing ? "Getting closer" : "Receding from you"}
					</p>
					<p className="vg-tile__value">
						<span className="vg-distance__num" style={{ "--ch": 4.5 } as Vars}>
							<span ref={away}>{Math.abs(first.kmPerS).toFixed(2)}</span>
						</span>
						<span className="vg-unit">km/s</span>
					</p>
					<p className="vg-tile__note">Swings by 24 as Earth{NB}orbits.</p>
				</li>
				<li className="vg-tile" data-band="blue">
					<p className="vg-tile__label">Downlink</p>
					<p className="vg-tile__value">
						<span className="vg-distance__num" style={{ "--ch": 3 } as Vars}>
							160
						</span>
						<span className="vg-unit">bit/s</span>
					</p>
					<p className="vg-tile__note">Commands go up at 16.</p>
				</li>
			</ul>
		</div>
	);
}
