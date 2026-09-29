"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { useEffect, useRef } from "react";
import { preload } from "react-dom";
import { duration, fix, grouped } from "./ephemeris";
import {
	ARRIVE,
	type BeatId,
	type Box,
	beatAt,
	clamp,
	drifted,
	type Fit,
	MAG_ROOT,
	MAG_TIP,
	MEDIA_TALL,
	type Mode,
	ORDER,
	PACE,
	PLANS,
	type Pose,
	RIM,
	RIM_RADIUS,
	reach,
	type Shot,
	slots,
	smoother,
	soften,
	solve,
	track,
} from "./hero-frame";
import type { PartId } from "./model";
import type { Stage, View } from "./stage";
import "./hero.css";

interface Tag {
	part: PartId;
	name: string;
	spec?: string;
	dots?: readonly (readonly [string, boolean])[];
	also?: readonly PartId[];
}

const TAGS: readonly Tag[] = [
	{ part: "hga", name: "High-gain antenna", spec: "3.7 m dish · X-band" },
	{
		part: "mag",
		name: "Magnetometer",
		spec: "13 m boom",
		dots: [["MAG", true]],
	},
	{
		part: "pws",
		name: "Plasma wave",
		spec: "Two 10 m antennas",
		dots: [
			["PWS", true],
			["PRA", false],
		],
	},
	{ part: "rtg", name: "Three RTGs", spec: "Plutonium‑238 heat" },
	{
		part: "scan",
		name: "Scan platform",
		dots: [
			["ISS", false],
			["IRIS", false],
			["UVS", false],
			["PPS", false],
		],
	},
	{
		part: "lecp",
		name: "Particles",
		dots: [
			["CRS", false],
			["LECP", false],
			["PLS", false],
		],
		also: ["crs", "pls"],
	},
	{
		part: "record",
		name: "Golden Record",
		spec: "30.5 cm · gold-plated copper",
	},
	{ part: "bus", name: "Bus", spec: "Ten bays · six computers" },
];

const MODEL = "/voyager/voyager.glb";
const BEATS: readonly BeatId[] = ["title", "life", "parts", "home"];
const DEAD: readonly PartId[] = ["scan", "lecp", "crs", "pls"];
const CORE: ReadonlySet<PartId> = new Set(
	ORDER.filter((p) => p !== "mag" && p !== "pws"),
);
const ALL: ReadonlySet<PartId> = new Set(ORDER);
const DISH: ReadonlySet<PartId> = new Set<PartId>(["hga"]);
const SEED = fix(Date.UTC(2026, 8, 28));
// Touch flicks cover a whole transition in a few frames, so tall mode trails scroll more.
const TAU_SCROLL: Record<Mode, number> = { wide: 0.08, tall: 0.22 };
const TAU_RETURN = 0.4;
const DOCK_MS = 380;
const ARRIVAL_MS = 2800;
const RIM_STEPS = 48;
const two = (n: number) => String(n).padStart(2, "0");

const light = (seconds: number) => {
	const d = duration(seconds);
	return `${d.h} h ${two(d.m)} m ${two(d.s)} s`;
};

const spoken = (t: Tag) =>
	[t.spec, ...(t.dots ?? []).map(([id, on]) => `${id} ${on ? "on" : "off"}`)]
		.filter(Boolean)
		.join(", ");

function Spec({ tag }: { tag: Tag }) {
	return (
		<ul className="vg-hero__spec">
			{(tag.dots ?? []).map(([id, on]) => (
				<li key={id}>
					<i className="vg-hero__dot" data-on={on ? "" : undefined} />
					{id}
				</li>
			))}
			{tag.spec ? <li>{tag.spec}</li> : null}
		</ul>
	);
}

export function Hero() {
	preload(MODEL, {
		as: "fetch",
		crossOrigin: "anonymous",
		fetchPriority: "low",
	});
	const root = useRef<HTMLElement>(null);

	useEffect(() => {
		const section = root.current;
		const stick = section?.querySelector<HTMLElement>(".vg-hero__stick");
		const cv = section?.querySelector<HTMLCanvasElement>(".vg-hero__canvas");
		const svg = section?.querySelector<SVGSVGElement>(".vg-hero__ink");
		if (!section || !stick || !cv || !svg) return;
		const q = <T extends Element>(sel: string) =>
			[...section.querySelectorAll<T>(sel)] as T[];
		const one = <T extends Element>(sel: string) =>
			section.querySelector<T>(sel);
		const beatsEl = BEATS.map((id) => one<HTMLElement>(`[data-beat="${id}"]`));
		const tagsLayer = one<HTMLElement>(".vg-hero__tags");
		const tagEls = q<HTMLElement>(".vg-hero__tag");
		const leaderEls = q<SVGPathElement>("[data-leader]");
		const ringEls = q<SVGCircleElement>("[data-ring]");
		const pipEls = q<SVGCircleElement>("[data-pip]");
		const extraEls = q<SVGCircleElement>("[data-extra]");
		const partsInk = one<SVGGElement>('[data-ink="parts"]');
		const lifeInk = one<SVGGElement>('[data-ink="life"]');
		const dockInk = one<SVGGElement>('[data-ink="dock"]');
		const dimLines = q<SVGPathElement>("[data-dim]");
		const dimTags = q<HTMLElement>(".vg-hero__dim");
		const dimsLayer = one<HTMLElement>(".vg-hero__dims");
		const dockLine = one<SVGPathElement>("[data-dockline]");
		const dockRing = one<SVGCircleElement>("[data-dockring]");
		const dock = one<HTMLElement>(".vg-hero__dock");
		const cards = q<HTMLElement>(".vg-hero__card");
		const prev = one<HTMLButtonElement>('[data-step="-1"]');
		const next = one<HTMLButtonElement>('[data-step="1"]');
		const cue = one<HTMLElement>(".vg-hero__cue");
		const zoneLeft = one<HTMLElement>(".vg-hero__zone--left");
		const zoneRight = one<HTMLElement>(".vg-hero__zone--right");
		const km = one<HTMLElement>(".vg-hero__km");
		const lt = one<HTMLElement>(".vg-hero__lt");

		const still = window.matchMedia("(prefers-reduced-motion: reduce)");
		const tallQuery = window.matchMedia(MEDIA_TALL);
		const coarse = window.matchMedia("(pointer: coarse)");
		const abort = new AbortController();
		const timers = new Map<Element, number>();
		let cancelled = false;
		let stage: Stage | null = null;
		let mode: Mode = tallQuery.matches ? "tall" : "wide";
		let w = 0;
		let h = 0;
		let glDpr = 1;
		let degraded = false;
		let shots: Shot[] = [];
		let fits: Fit[] = [];
		let ranges: [number, number][] = [];
		let sides: ("left" | "right")[] = [];
		let tagHeight = 48;
		let colLeft = 0;
		let colRight = 0;
		let seeded = false;
		let u = 0;
		let s = 0;
		let beat: BeatId | null = null;
		let spin = 0;
		let velocity = 0;
		let pointer: { id: number; x: number; t: number } | null = null;
		let arrival: { t0: number; amount: number } | null = null;
		let arrived = false;
		let hover: PartId | null = null;
		let manual: { index: number; base: number } | null = null;
		let step = 0;
		let dockPart: PartId | null = null;
		let dockPrev: PartId | null = null;
		let dockT0 = 0;
		let frame = 0;
		let visible = true;
		let last = performance.now();
		let drawn = "";
		let firstFrame = 0;
		const gaps: number[] = [];
		const off = new Map<PartId, number>();
		const painted = new Map<Element, string>();

		const paint = (
			el: Element | null | undefined,
			key: string,
			apply: () => void,
		) => {
			if (!el || painted.get(el) === key) return;
			painted.set(el, key);
			apply();
		};

		const setState = (el: Element | null | undefined, on: boolean) => {
			if (!el) return;
			const node = el as HTMLElement | SVGElement;
			const state = node.dataset.state;
			const pending = timers.get(el);
			if (on) {
				if (pending) {
					window.clearTimeout(pending);
					timers.delete(el);
				}
				if (state !== "in") node.dataset.state = "in";
				return;
			}
			if (state !== "in") return;
			node.dataset.state = "out";
			timers.set(
				el,
				window.setTimeout(
					() => {
						timers.delete(el);
						if (node.dataset.state === "out") node.dataset.state = "wait";
					},
					still.matches ? 0 : 260,
				),
			);
		};

		const box = (el: HTMLElement | null, grow: number): Box | null =>
			el && el.offsetWidth > 0
				? {
						l: el.offsetLeft - grow,
						t: el.offsetTop - grow,
						r: el.offsetLeft + el.offsetWidth + grow,
						b: el.offsetTop + el.offsetHeight + grow,
					}
				: null;

		const pace = () => PACE[mode];

		const viewOf = (
			pose: Pose,
			scale: number,
			cx: number,
			cy: number,
		): View => {
			const dying = clamp((pose.explode - 0.45) / 0.4);
			for (const part of DEAD) off.set(part, dying * dying * (3 - 2 * dying));
			return {
				yaw: pose.yaw,
				pitch: pose.pitch,
				scale,
				cx,
				cy,
				explode: pose.explode,
				focus: null,
				off,
				heat: 0,
				fold: pose.fold,
				stow: pose.stow,
				grow: pose.grow !== 1 ? { record: pose.grow } : undefined,
			};
		};

		const plan = () => {
			const tall = mode === "tall";
			const nav = 52;
			const edge = tall ? 10 : 24;
			const pad = tall ? 14 : 28;
			const base: Box = {
				l: edge,
				t: nav + (tall ? 10 : 16),
				r: w - edge,
				b: h - (tall ? 14 : 28),
			};
			const copy = beatsEl.map((el) => box(el, pad));
			const cueBox = box(cue, 10);
			const dockBox = box(dock, 12);
			const left = box(zoneLeft, 0);
			const right = box(zoneRight, 0);
			colLeft = left ? left.r : w * 0.2;
			colRight = right ? right.l : w * 0.8;
			const fitTitle: Fit = {
				w,
				h,
				inside: base,
				avoid: [copy[0], cueBox].filter((b): b is Box => !!b),
				target: tall
					? [w / 2, ((copy[0]?.b ?? h * 0.4) + base.b) / 2]
					: [w * 0.68, h * 0.55],
				fill: 0.94,
				cap: tall ? 120 : 260,
				core: CORE,
			};
			const fitLife: Fit = {
				w,
				h,
				inside: base,
				avoid: [copy[1]].filter((b): b is Box => !!b),
				target: tall
					? [w / 2, ((copy[1]?.b ?? h * 0.3) + base.b) / 2]
					: [w * 0.58, h * 0.6],
				fill: 0.95,
				cap: 220,
				core: ALL,
			};
			const head = copy[2];
			const partsInside: Box = tall
				? {
						l: base.l,
						r: base.r,
						t: head ? head.b : base.t,
						b: dockBox ? dockBox.t : base.b,
					}
				: {
						l: colLeft + 28,
						r: colRight - 28,
						t: head ? head.b : base.t,
						b: base.b,
					};
			const fitParts: Fit = {
				w,
				h,
				inside: partsInside,
				avoid: [
					head,
					tall ? dockBox : null,
					tall || !left
						? null
						: { l: 0, t: partsInside.t, r: colLeft + 8, b: h },
					tall || !right
						? null
						: { l: colRight - 8, t: partsInside.t, r: w, b: h },
				].filter((b): b is Box => !!b),
				target: [
					(partsInside.l + partsInside.r) / 2,
					(partsInside.t + partsInside.b) / 2,
				],
				fill: 0.96,
				cap: 220,
				core: CORE,
			};
			const home = copy[3];
			const fitHome: Fit = {
				w,
				h,
				inside: tall ? { ...base, b: home ? home.t : base.b } : base,
				avoid: [home].filter((b): b is Box => !!b),
				target: tall
					? [w / 2, (base.t + (home ? home.t : h * 0.6)) / 2]
					: [
							Math.max(w * 0.66, (home?.r ?? 0) + (w - (home?.r ?? 0)) / 2),
							h * 0.52,
						],
				fill: 0.97,
				cap: tall
					? (0.78 * w) / (2 * RIM_RADIUS)
					: Math.min(
							(0.68 * (h - nav)) / (2 * RIM_RADIUS),
							(0.4 * w) / (2 * RIM_RADIUS),
						),
				core: DISH,
			};
			fits = [fitTitle, fitLife, fitParts, fitHome];
			const plans = PLANS[mode];
			shots = BEATS.map((id, i) => {
				const p = plans[id];
				const poses =
					id === "title"
						? [p.pose, { ...p.pose, yaw: p.pose.yaw + ARRIVE }]
						: p.drift
							? [drifted(p, -0.5), drifted(p, 0), drifted(p, 0.5)]
							: [p.pose];
				return { ...p, cam: solve(poses, fits[i]) };
			});
			ranges = shots.map((shot, i) =>
				reach(drifted(shot, 0), shot.cam, fits[i], 0.9),
			);
			svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
			tagsLayer?.style.setProperty(
				"--tag-w",
				`${Math.max(140, Math.round(Math.min(colLeft - edge, w - colRight - edge)))}px`,
			);
			tagHeight = Math.max(40, ...tagEls.map((t) => t.offsetHeight));
			assignSides();
			drawn = "";
		};

		const assignSides = () => {
			const shot = shots[2];
			if (!stage || !shot) return;
			const pose = drifted(shot, 0);
			const view = viewOf(pose, shot.cam.scale, shot.cam.cx, shot.cam.cy);
			const xs = TAGS.map((t) => stage?.anchor(t.part, view)[0] ?? 0);
			const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
			const half = Math.floor(TAGS.length / 2);
			sides = TAGS.map(() => "right");
			order.forEach((i, k) => {
				sides[i] = k < half ? "left" : "right";
			});
			tagEls.forEach((el, i) => {
				el.dataset.side = sides[i];
			});
		};

		const size = () => {
			w = stick.clientWidth;
			h = stick.clientHeight;
			const device = window.devicePixelRatio || 1;
			glDpr = degraded ? 1.5 : Math.min(2, Math.max(1.5, device));
			stage?.resize(w, h, glDpr);
			plan();
		};

		const progress = () => {
			const rect = section.getBoundingClientRect();
			const span = section.offsetHeight - stick.offsetHeight;
			return span > 0 ? clamp(-rect.top / span) : 0;
		};

		const tick = () => {
			const f = fix(Date.now());
			if (km) km.textContent = grouped(f.km);
			if (lt) lt.textContent = light(f.lightSeconds);
		};

		const watch = (now: number, gap: number) => {
			if (degraded || !coarse.matches || !stage || glDpr <= 1.5) return;
			if (!firstFrame || now - firstFrame < 2000) return;
			gaps.push(gap);
			if (gaps.length < 60) return;
			const sorted = [...gaps].sort((a, b) => a - b);
			gaps.length = 0;
			if (sorted[Math.floor(sorted.length * 0.9)] > 20) {
				degraded = true;
				size();
			}
		};

		const stepIndex = (local: number) =>
			Math.min(TAGS.length - 1, Math.max(0, Math.floor(local * TAGS.length)));

		const enter = (id: BeatId | null) => {
			beatsEl.forEach((el, i) => {
				setState(el, BEATS[i] === id);
			});
			setState(lifeInk, id === "life");
			setState(dimsLayer, id === "life");
			setState(partsInk, id === "parts" && mode === "wide");
			setState(tagsLayer, id === "parts" && mode === "wide");
			setState(dockInk, id === "parts" && mode === "tall");
			setState(dock, id === "parts" && mode === "tall");
			if (dock) dock.inert = !(id === "parts" && mode === "tall");
			if (id !== "parts") {
				hover = null;
				manual = null;
				dockPart = null;
				dockPrev = null;
			}
		};

		const showCards = (index: number) => {
			cards.forEach((c, i) => {
				if (i === index) c.dataset.on = "";
				else delete c.dataset.on;
			});
			if (prev) prev.disabled = index <= 0;
			if (next) next.disabled = index >= TAGS.length - 1;
		};

		const leaders = (view: View, focus: PartId | null) => {
			if (!stage) return;
			const s0 = stage;
			const fit = fits[2];
			const top = fit.inside.t + tagHeight / 2;
			const bottom = h - 28 - tagHeight / 2;
			const anchors = TAGS.map((t) => s0.anchor(t.part, view));
			const ys: number[] = new Array(TAGS.length).fill(0);
			for (const side of ["left", "right"] as const) {
				const idx = TAGS.map((_, i) => i).filter((i) => sides[i] === side);
				const placed = slots(
					idx.map((i) => anchors[i][1]),
					top,
					bottom,
					tagHeight + 10,
				);
				idx.forEach((i, k) => {
					ys[i] = placed[k];
				});
			}
			let extra = 0;
			TAGS.forEach((t, i) => {
				const [ax, ay] = anchors[i];
				const left = sides[i] === "left";
				const y = ys[i];
				const col = left ? colLeft : colRight;
				const start = left ? col + 6 : col - 6;
				const knee = left
					? Math.min(ax, Math.max(start + 16, fit.inside.l))
					: Math.max(ax, Math.min(start - 16, fit.inside.r));
				const hot = focus === t.part;
				const el = tagEls[i];
				paint(el, `${col.toFixed(1)} ${y.toFixed(1)} ${hot}`, () => {
					el.style.translate = `${col.toFixed(1)}px ${y.toFixed(1)}px`;
					if (hot) el.dataset.hot = "";
					else delete el.dataset.hot;
				});
				const yy = Math.round(y) + 0.5;
				let d = `M${start.toFixed(1)} ${yy}H${knee.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}`;
				for (const part of t.also ?? []) {
					const [ex, ey] = s0.anchor(part, view);
					d += `M${knee.toFixed(1)} ${yy}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
					const pip = extraEls[extra++];
					if (pip) {
						pip.setAttribute("cx", ex.toFixed(1));
						pip.setAttribute("cy", ey.toFixed(1));
						if (hot) pip.dataset.hot = "";
						else delete pip.dataset.hot;
					}
				}
				const line = leaderEls[i];
				if (line) {
					line.setAttribute("d", d);
					if (hot) line.dataset.hot = "";
					else delete line.dataset.hot;
				}
				const ring = ringEls[i];
				const pip = pipEls[i];
				for (const c of [ring, pip]) {
					if (!c) continue;
					c.setAttribute("cx", ax.toFixed(1));
					c.setAttribute("cy", ay.toFixed(1));
					if (hot) c.dataset.hot = "";
					else delete c.dataset.hot;
				}
			});
		};

		const dockLeader = (view: View, focus: PartId, now: number) => {
			if (!stage || !dock || !dockLine || !dockRing) return;
			let [ax, ay] = stage.anchor(focus, view);
			if (dockPrev) {
				const t = (now - dockT0) / DOCK_MS;
				if (t >= 1) dockPrev = null;
				else {
					const [bx, by] = stage.anchor(dockPrev, view);
					const k = smoother(t);
					ax = bx + (ax - bx) * k;
					ay = by + (ay - by) * k;
				}
			}
			const x = Math.min(w - 6, Math.max(6, ax));
			const y = Math.min(dock.offsetTop - 12, Math.max(60, ay));
			dockLine.setAttribute(
				"d",
				`M${Math.round(x) + 0.5} ${(y + 5).toFixed(1)}V${dock.offsetTop}`,
			);
			dockRing.setAttribute("cx", x.toFixed(1));
			dockRing.setAttribute("cy", y.toFixed(1));
		};

		const dims = (view: View) => {
			if (!stage) return;
			const s0 = stage;
			const [rx, ry] = s0.project(MAG_ROOT, view);
			const [tx, ty] = s0.project(MAG_TIP, view);
			let dx = tx - rx;
			let dy = ty - ry;
			const len = Math.hypot(dx, dy) || 1;
			dx /= len;
			dy /= len;
			let nx = -dy;
			let ny = dx;
			if (nx < 0) {
				nx = -nx;
				ny = -ny;
			}
			const lift = 20;
			const a = [rx + nx * lift, ry + ny * lift];
			const b = [tx + nx * lift, ty + ny * lift];
			const tick = (p: number[]) =>
				`M${(p[0] - nx * 5).toFixed(1)} ${(p[1] - ny * 5).toFixed(1)}L${(p[0] + nx * 5).toFixed(1)} ${(p[1] + ny * 5).toFixed(1)}`;
			const boom = `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}${tick(a)}${tick(b)}`;
			dimLines[0]?.setAttribute("d", boom);
			const mid = [(a[0] + b[0]) / 2 + nx * 4, (a[1] + b[1]) / 2 + ny * 4];
			if (dimTags[0])
				dimTags[0].style.translate = `${mid[0].toFixed(1)}px ${mid[1].toFixed(1)}px`;
			if (mode === "tall") {
				dimLines[1]?.setAttribute("d", "");
				return;
			}
			let lx = Number.POSITIVE_INFINITY;
			let ly = 0;
			let hx = Number.NEGATIVE_INFINITY;
			let hy = 0;
			let topY = Number.POSITIVE_INFINITY;
			for (let k = 0; k < RIM_STEPS; k++) {
				const t = (k / RIM_STEPS) * Math.PI * 2;
				const [px, py] = s0.project(
					[
						RIM[0] + RIM_RADIUS * Math.cos(t),
						RIM[1],
						RIM[2] + RIM_RADIUS * Math.sin(t),
					],
					view,
				);
				if (px < lx) {
					lx = px;
					ly = py;
				}
				if (px > hx) {
					hx = px;
					hy = py;
				}
				topY = Math.min(topY, py);
			}
			const [, feedY] = s0.project([RIM[0], RIM[1] + 0.9, RIM[2]], view);
			const y = Math.min(topY, feedY) - 16;
			const yy = Math.round(y) + 0.5;
			const dish = `M${lx.toFixed(1)} ${yy}H${hx.toFixed(1)}M${lx.toFixed(1)} ${(yy - 5).toFixed(1)}V${(ly - 6).toFixed(1)}M${hx.toFixed(1)} ${(yy - 5).toFixed(1)}V${(hy - 6).toFixed(1)}`;
			dimLines[1]?.setAttribute("d", dish);
			if (dimTags[1])
				dimTags[1].style.translate = `${((lx + hx) / 2).toFixed(1)}px ${(yy - 12).toFixed(1)}px`;
		};

		const draw = (now: number) => {
			frame = 0;
			const gap = now - last;
			const dt = Math.min(0.05, gap / 1000);
			last = now;
			const p = pace();
			const raw = progress() * p.span;
			const scrolled = Math.abs(raw - u) > 1e-3;
			u = raw;
			if (!seeded || still.matches) {
				s = u;
				seeded = true;
			} else s += (u - s) * (1 - Math.exp(-dt / TAU_SCROLL[mode]));
			if (Math.abs(u - s) < 1e-3) s = u;
			const nextBeat = beatAt(u, p.beats, beat);
			if (nextBeat !== beat) {
				beat = nextBeat;
				enter(beat);
			}
			setState(cue, u < p.cue && beat === "title");

			if (arrival) {
				const t = clamp((now - arrival.t0) / ARRIVAL_MS);
				if (scrolled || pointer || t >= 1) {
					spin += arrival.amount * (1 - t) ** 3;
					arrival = null;
				}
			}
			if (!pointer) {
				if (still.matches) velocity = 0;
				spin += velocity * dt;
				velocity *= 0.92 ** (dt * 60);
				if (Math.abs(velocity) < 0.002) velocity = 0;
				if (scrolled || Math.abs(u - s) > 0.05) {
					velocity = 0;
					spin *= Math.exp(-dt / TAU_RETURN);
				}
			}
			const take = track(s, p.beats, shots, still.matches);
			const range = take.hold >= 0 ? ranges[take.hold] : null;
			let extra = spin;
			if (arrival) {
				const t = clamp((now - arrival.t0) / ARRIVAL_MS);
				extra += arrival.amount * (1 - t) ** 3;
			}
			if (range) spin = clamp(spin, range[0] - 0.3, range[1] + 0.3);
			const limited = range ? soften(extra, range[0], range[1]) : extra;
			if (Math.abs(spin) < 1e-4 && !pointer) spin = 0;
			const pose: Pose = { ...take.pose, yaw: take.pose.yaw + limited };
			const view = viewOf(pose, take.cam.scale, take.cam.cx, take.cam.cy);

			let focus: PartId | null = null;
			if (beat === "parts") {
				if (mode === "tall") {
					const b = p.beats[2];
					const auto = stepIndex((u - b.from) / (b.to - b.from));
					if (manual && manual.base !== auto) manual = null;
					const index = manual ? manual.index : auto;
					if (
						index !== step ||
						!cards.some((c) => c.dataset.on !== undefined)
					) {
						step = index;
						showCards(step);
					}
					focus = TAGS[step].part;
					if (focus !== dockPart) {
						dockPrev = dockPart && !still.matches ? dockPart : null;
						dockT0 = now;
						dockPart = focus;
					}
				} else focus = hover;
			}
			view.focus = mode === "wide" ? focus : null;

			const signature = [
				view.yaw.toFixed(5),
				view.pitch.toFixed(5),
				view.scale.toFixed(3),
				view.cx.toFixed(2),
				view.cy.toFixed(2),
				view.explode.toFixed(4),
				focus,
				w,
				h,
				glDpr,
				stage ? 1 : 0,
			].join(" ");
			const fresh = signature !== drawn;
			if (stage && fresh) {
				drawn = signature;
				stage.draw(view);
				watch(now, gap);
				if (!cv.dataset.ready) {
					cv.dataset.ready = "";
					firstFrame = now;
					if (!arrived && !still.matches && beat === "title" && s < 4) {
						arrival = { t0: now, amount: ARRIVE };
					}
					arrived = true;
				}
				if (mode === "wide" && (beat === "parts" || take.hold === 2))
					leaders(view, focus);
				if (beat === "life" || take.hold === 1) dims(view);
			} else gaps.length = 0;
			if (stage && mode === "tall" && focus && (fresh || dockPrev))
				dockLeader(view, focus, now);

			const moving =
				Math.abs(u - s) > 1e-3 ||
				dockPrev !== null ||
				pointer !== null ||
				arrival !== null ||
				velocity !== 0 ||
				(spin !== 0 && scrolled);
			if (visible && (moving || scrolled)) frame = requestAnimationFrame(draw);
		};

		const kick = () => {
			if (!frame && visible) {
				last = performance.now();
				frame = requestAnimationFrame(draw);
			}
		};

		const down = (e: PointerEvent) => {
			if (e.button !== 0) return;
			pointer = { id: e.pointerId, x: e.clientX, t: performance.now() };
			velocity = 0;
			kick();
		};
		const move = (e: PointerEvent) => {
			if (!pointer || e.pointerId !== pointer.id) return;
			const now = performance.now();
			const dx = e.clientX - pointer.x;
			const turn = (dx / Math.max(360, w)) * Math.PI * 1.2;
			spin += turn;
			const inst = turn / Math.max(0.008, (now - pointer.t) / 1000);
			velocity = velocity * 0.4 + inst * 0.6;
			pointer = { id: e.pointerId, x: e.clientX, t: now };
			kick();
		};
		const up = (e: PointerEvent) => {
			if (!pointer || e.pointerId !== pointer.id) return;
			if (performance.now() - pointer.t > 80) velocity = 0;
			pointer = null;
			kick();
		};
		const cancel = (e: PointerEvent) => {
			if (!pointer || e.pointerId !== pointer.id) return;
			pointer = null;
			velocity = 0;
			kick();
		};

		const hoverOn = (e: Event) => {
			const i = tagEls.indexOf(e.currentTarget as HTMLElement);
			if (i >= 0 && beat === "parts") {
				hover = TAGS[i].part;
				kick();
			}
		};
		const hoverOff = () => {
			hover = null;
			kick();
		};

		const stepBy = (delta: number) => {
			const b = pace().beats[2];
			const auto = stepIndex((u - b.from) / (b.to - b.from));
			const index = Math.min(TAGS.length - 1, Math.max(0, step + delta));
			manual = { index, base: auto };
			kick();
		};
		const onPrev = () => stepBy(-1);
		const onNext = () => stepBy(1);

		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible) kick();
		});
		const ro = new ResizeObserver(() => {
			const tall = tallQuery.matches;
			const changed = (tall ? "tall" : "wide") !== mode;
			mode = tall ? "tall" : "wide";
			size();
			if (changed) {
				beat = null;
				seeded = false;
			}
			kick();
		});
		io.observe(section);
		ro.observe(stick);
		size();
		tick();
		const odometer = window.setInterval(() => {
			if (visible && beat === "title" && document.visibilityState === "visible")
				tick();
		}, 100);
		cv.addEventListener("pointerdown", down);
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", cancel);
		window.addEventListener("scroll", kick, { passive: true });
		for (const el of tagEls) {
			el.addEventListener("pointerenter", hoverOn);
			el.addEventListener("pointerleave", hoverOff);
		}
		prev?.addEventListener("click", onPrev);
		next?.addEventListener("click", onNext);
		document.fonts?.ready.then(() => {
			if (cancelled) return;
			plan();
			kick();
		});
		kick();

		import("./stage")
			.then(({ createStage }) => {
				if (cancelled) return null;
				return createStage(cv, {
					shadow: coarse.matches ? 1024 : 2048,
					signal: abort.signal,
				});
			})
			.then((made) => {
				if (!made) return;
				if (cancelled) {
					made.dispose();
					return;
				}
				stage = made;
				stage.resize(w, h, glDpr);
				assignSides();
				drawn = "";
				kick();
			})
			.catch(() => {});

		return () => {
			cancelled = true;
			abort.abort();
			cancelAnimationFrame(frame);
			window.clearInterval(odometer);
			for (const t of timers.values()) window.clearTimeout(t);
			io.disconnect();
			ro.disconnect();
			cv.removeEventListener("pointerdown", down);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", cancel);
			window.removeEventListener("scroll", kick);
			for (const el of tagEls) {
				el.removeEventListener("pointerenter", hoverOn);
				el.removeEventListener("pointerleave", hoverOff);
			}
			prev?.removeEventListener("click", onPrev);
			next?.removeEventListener("click", onNext);
			stage?.dispose();
			stage = null;
		};
	}, []);

	return (
		<section className="vg-hero" ref={root} aria-labelledby="vg-hero-name">
			<div className="vg-hero__stick">
				<canvas
					className="vg-hero__canvas"
					role="img"
					aria-label="A 3D model of Voyager 1. Drag sideways to turn it."
				/>
				<svg className="vg-hero__ink" aria-hidden="true" focusable="false">
					<g className="vg-hero__layer" data-ink="life" data-state="wait">
						<path className="vg-hero__dimline" data-dim="" />
						<path className="vg-hero__dimline" data-dim="" />
					</g>
					<g className="vg-hero__layer" data-ink="parts" data-state="wait">
						{TAGS.map((t) => (
							<path key={t.part} data-leader="" />
						))}
						{TAGS.map((t) => (
							<circle key={t.part} data-ring="" r="4.5" />
						))}
						{TAGS.map((t) => (
							<circle
								key={t.part}
								data-pip=""
								className="vg-hero__pip"
								r="1.5"
							/>
						))}
						{TAGS.flatMap((t) => t.also ?? []).map((part) => (
							<circle key={part} data-extra="" className="vg-hero__pip" r="2" />
						))}
					</g>
					<g className="vg-hero__layer" data-ink="dock" data-state="wait">
						<path data-dockline="" data-hot="" />
						<circle data-dockring="" data-hot="" r="4.5" />
					</g>
				</svg>
				<i className="vg-hero__zone vg-hero__zone--left" />
				<i className="vg-hero__zone vg-hero__zone--right" />
				<div
					className="vg-hero__tags vg-hero__layer"
					data-state="wait"
					aria-hidden="true"
				>
					{TAGS.map((t) => (
						<div key={t.part} className="vg-hero__tag" data-side="right">
							<span className="vg-hero__tag-name">{t.name}</span>
							<Spec tag={t} />
						</div>
					))}
				</div>
				<div
					className="vg-hero__dims vg-hero__layer"
					data-state="wait"
					aria-hidden="true"
				>
					<p className="vg-hero__dim">13 m</p>
					<p className="vg-hero__dim">3.7 m</p>
				</div>
				<div
					className="vg-hero__beat vg-hero__beat--title"
					data-beat="title"
					data-state="in"
				>
					<p className="vg-eyebrow">Launched September 5, 1977</p>
					<h2 id="vg-hero-name" className="vg-hero__wordmark">
						Voyager 1<span className="vg-stop">.</span>
					</h2>
					<p className="vg-hero__lede">
						The farthest thing people have ever made. Still switched{" "}on.
					</p>
					<dl className="vg-hero__odo">
						<div className="vg-hero__tile">
							<dt>Kilometers from Earth</dt>
							<dd>
								<span className="vg-hero__km">{grouped(SEED.km)}</span>
							</dd>
						</div>
						<div className="vg-hero__tile">
							<dt>Light takes</dt>
							<dd>
								<span className="vg-hero__lt">{light(SEED.lightSeconds)}</span>
							</dd>
						</div>
					</dl>
				</div>
				<div
					className="vg-hero__beat vg-hero__beat--life"
					data-beat="life"
					data-state="wait"
					aria-hidden="true"
				>
					<p className="vg-hero__big">
						Built for a five‑year trip to Jupiter and{" "}Saturn.
						<span className="vg-dim">
							{" "}
							Still working, forty‑nine years{" "}later.
						</span>
					</p>
				</div>
				<div
					className="vg-hero__beat vg-hero__beat--parts"
					data-beat="parts"
					data-state="wait"
					aria-hidden="true"
				>
					<p className="vg-hero__big">
						Ten instruments.{" "}
						<span className="vg-dim">
							Two still on<span className="vg-stop">.</span>
						</span>
					</p>
					<ul className="vg-hero__key">
						<li>
							<i className="vg-hero__dot" data-on="" />
							Still on
						</li>
						<li>
							<i className="vg-hero__dot" />
							Switched off
						</li>
					</ul>
				</div>
				<div
					className="vg-hero__beat vg-hero__beat--home"
					data-beat="home"
					data-state="wait"
					aria-hidden="true"
				>
					<p className="vg-hero__big">
						It is looking at you<span className="vg-stop">.</span>
						<span className="vg-dim">
							{" "}
							Its dish has to hold Earth inside a radio beam just 0.6°{" "}wide.
						</span>
					</p>
				</div>
				<div className="vg-hero__dock vg-hero__layer" data-state="wait" inert>
					<div className="vg-hero__deck">
						<div className="vg-hero__cards" aria-live="polite">
							{TAGS.map((t, i) => (
								<div
									key={t.part}
									className="vg-hero__card"
									data-on={i === 0 ? "" : undefined}
								>
									<p className="vg-hero__count">
										{i + 1} / {TAGS.length}
									</p>
									<p className="vg-hero__card-name">{t.name}</p>
									<Spec tag={t} />
								</div>
							))}
						</div>
						<div className="vg-hero__steps">
							<button
								type="button"
								className="vg-hero__step"
								data-step="-1"
								aria-label="Previous part"
								disabled
							>
								<LifeArrow direction="left" active={false} />
							</button>
							<button
								type="button"
								className="vg-hero__step"
								data-step="1"
								aria-label="Next part"
							>
								<LifeArrow direction="right" active={false} />
							</button>
						</div>
					</div>
				</div>
				<p
					className="vg-hero__cue vg-hero__layer"
					data-state="in"
					aria-hidden="true"
				>
					<span className="vg-hero__cue-fine">
						Scroll to take it apart. Drag to turn it.
					</span>
					<span className="vg-hero__cue-touch">Scroll to take it apart</span>
					<LifeArrow direction="down" active={false} />
				</p>
				<div className="vg-hero__sr">
					<p>
						Built for a five-year trip to Jupiter and Saturn. Still working,
						forty-nine years later.
					</p>
					<p>Ten instruments. Two still on.</p>
					<ul>
						{TAGS.map((t) => (
							<li key={t.part}>
								{t.name}: {spoken(t)}
							</li>
						))}
					</ul>
					<p>
						It is looking at you. Its dish has to hold Earth inside a radio beam
						just 0.6° wide.
					</p>
				</div>
			</div>
		</section>
	);
}
