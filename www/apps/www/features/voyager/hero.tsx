"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { useEffect, useRef } from "react";
import { preload } from "react-dom";
import { duration, fix, grouped } from "./ephemeris";
import {
	ARRIVE,
	type Beat,
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
	PLANS,
	type Pose,
	RIM,
	RIM_RADIUS,
	reach,
	type Shot,
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
const NAV = 52;
const READ: Record<Mode, number> = { wide: 0.5, tall: 0.3 };
const LEAD = 0.1;
const REACH = 0.4;
const CUE_PX = 40;
const TAU_SCROLL = 0.08;
const TAU_RETURN = 0.4;
const POINT_MS = 380;
const ARRIVAL_MS = 2800;
const RIM_STEPS = 48;
const two = (n: number) => String(n).padStart(2, "0");

const light = (seconds: number) => {
	const d = duration(seconds);
	return `${d.h} h ${two(d.m)} m ${two(d.s)} s`;
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
		const one = <T extends Element>(sel: string) =>
			section?.querySelector<T>(sel) ?? null;
		const stick = one<HTMLElement>(".vg-hero__stick");
		const cv = one<HTMLCanvasElement>(".vg-hero__canvas");
		const svg = one<SVGSVGElement>(".vg-hero__ink");
		const head = one<HTMLElement>(".vg-hero__head");
		const flow = one<HTMLElement>(".vg-hero__flow");
		if (!section || !stick || !cv || !svg || !head || !flow) return;
		const q = <T extends Element>(sel: string) =>
			[...section.querySelectorAll<T>(sel)] as T[];
		const blocks = q<HTMLElement>("[data-block]");
		const items = q<HTMLElement>(".vg-hero__item");
		const list = one<HTMLElement>(".vg-hero__list");
		const lifeInk = one<SVGGElement>('[data-ink="life"]');
		const pointInk = one<SVGGElement>('[data-ink="point"]');
		const pointLine = one<SVGPathElement>("[data-pointline]");
		const pointRing = one<SVGCircleElement>("[data-pointring]");
		const pointGate = one<SVGCircleElement>("[data-pointgate]");
		const dimLines = q<SVGPathElement>("[data-dim]");
		const dimTags = q<HTMLElement>(".vg-hero__dim");
		const dimsLayer = one<HTMLElement>(".vg-hero__dims");
		const cue = one<HTMLElement>(".vg-hero__cue");
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
		let beats: Beat[] = BEATS.map((id) => ({ id, from: 0, to: 0 }));
		let marks: number[] = [];
		let measure: [number, number] = [0, 0];
		let measuring = false;
		let line = 0;
		let gate = 0;
		let seeded = false;
		let u = 0;
		let s = 0;
		let beat: BeatId | null = null;
		let spin = 0;
		let velocity = 0;
		let pointer: { id: number; x: number; t: number } | null = null;
		let arrival: { t0: number; amount: number } | null = null;
		let arrived = false;
		let active = -1;
		let pointPart: PartId | null = null;
		let pointAt: [number, number] | null = null;
		let pointFrom: [number, number] | null = null;
		let pointT0 = 0;
		let frame = 0;
		let visible = true;
		let last = performance.now();
		let drawn = "";
		let firstFrame = 0;
		const gaps: number[] = [];
		const off = new Map<PartId, number>();

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

		const frameTall = (): Fit[] => {
			const inside: Box = { l: 10, t: NAV + 10, r: w - 10, b: h - 14 };
			const fit = (
				fill: number,
				cap: number,
				core: ReadonlySet<PartId>,
			): Fit => ({
				w,
				h,
				inside,
				avoid: [],
				target: [w / 2, (inside.t + inside.b) / 2],
				fill,
				cap,
				core,
			});
			return [
				fit(0.94, 120, CORE),
				fit(0.95, 220, ALL),
				fit(0.96, 220, CORE),
				fit(0.97, (0.78 * w) / (2 * RIM_RADIUS), DISH),
			];
		};

		const frameWide = (): Fit[] => {
			const base: Box = { l: 24, t: NAV + 16, r: w - 24, b: h - 28 };
			const edge = flow.offsetLeft + flow.offsetWidth;
			gate = (list ? list.getBoundingClientRect().right : edge) + 12;
			const side: Box = { ...base, l: edge + 40 };
			const column: Box = { l: 0, t: 0, r: edge + 20, b: h };
			const middle = (side.l + side.r) / 2;
			const title = box(head, 28);
			const cueBox = box(cue, 10);
			return [
				{
					w,
					h,
					inside: base,
					avoid: [title, cueBox].filter((b): b is Box => !!b),
					target: [w * 0.68, h * 0.55],
					fill: 0.94,
					cap: 260,
					core: CORE,
				},
				{
					w,
					h,
					inside: base,
					avoid: [column],
					target: [middle, h * 0.56],
					fill: 0.95,
					cap: 220,
					core: ALL,
				},
				{
					w,
					h,
					inside: side,
					avoid: [column],
					target: [middle, (side.t + side.b) / 2],
					fill: 0.96,
					cap: 220,
					core: CORE,
				},
				{
					w,
					h,
					inside: base,
					avoid: [column],
					target: [middle, h * 0.52],
					fill: 0.97,
					cap: Math.min(
						(0.68 * (h - NAV)) / (2 * RIM_RADIUS),
						(0.4 * w) / (2 * RIM_RADIUS),
					),
					core: DISH,
				},
			];
		};

		const chart = () => {
			const origin = section.getBoundingClientRect().top;
			const top = (el: Element) => el.getBoundingClientRect().top - origin;
			const vh = document.documentElement.clientHeight;
			const zone = mode === "tall" ? h : NAV;
			line = zone + (vh - zone) * READ[mode];
			const lead = vh * LEAD;
			const enter = blocks.map((el) => top(el) - vh - lead);
			const land = blocks.map((el) => top(el) - line);
			const end = section.offsetHeight - h;
			let prev = 0;
			beats = BEATS.map((id, i) => {
				const from = Math.max(prev, i === 0 ? 0 : (land[i - 1] ?? prev));
				const to = Math.max(
					from,
					i < BEATS.length - 1 ? (enter[i] ?? from) : end,
				);
				prev = to;
				return { id, from, to };
			});
			const [title, life, parts] = beats;
			measure = [
				life.from - (life.from - title.to) * REACH,
				life.to + (parts.from - life.to) * REACH,
			];
			marks = items.map((el) => {
				const name = el.querySelector(".vg-hero__item-name") ?? el;
				const r = name.getBoundingClientRect();
				return r.top - origin + r.height / 2 - el.offsetHeight / 2 - line;
			});
		};

		const plan = () => {
			fits = mode === "tall" ? frameTall() : frameWide();
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
			chart();
			drawn = "";
		};

		const size = () => {
			w = stick.clientWidth;
			h = stick.clientHeight;
			const device = window.devicePixelRatio || 1;
			glDpr = degraded ? 1.5 : Math.min(2, Math.max(1.5, device));
			stage?.resize(w, h, glDpr);
			plan();
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

		const mark = (index: number) => {
			items.forEach((el, i) => {
				if (i === index) el.dataset.on = "";
				else delete el.dataset.on;
			});
		};

		const point = (view: View, part: PartId, now: number) => {
			if (!stage || !pointLine || !pointRing) return;
			let [ax, ay] = stage.anchor(part, view);
			if (pointFrom) {
				const t = (now - pointT0) / POINT_MS;
				if (t >= 1) pointFrom = null;
				else {
					const k = smoother(t);
					ax = pointFrom[0] + (ax - pointFrom[0]) * k;
					ay = pointFrom[1] + (ay - pointFrom[1]) * k;
				}
			}
			pointAt = [ax, ay];
			if (mode === "tall") {
				const x = clamp(ax, 6, w - 6);
				const y = clamp(ay, NAV + 8, h - 12);
				pointLine.setAttribute(
					"d",
					`M${Math.round(x) + 0.5} ${(y + 5).toFixed(1)}V${h}`,
				);
				pointRing.setAttribute("cx", x.toFixed(1));
				pointRing.setAttribute("cy", y.toFixed(1));
				return;
			}
			const y = Math.round(line) + 0.5;
			const knee = Math.min(ax, Math.max(gate + 16, fits[2].inside.l));
			pointLine.setAttribute(
				"d",
				`M${gate.toFixed(1)} ${y}H${knee.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}`,
			);
			pointRing.setAttribute("cx", ax.toFixed(1));
			pointRing.setAttribute("cy", ay.toFixed(1));
			pointGate?.setAttribute("cx", gate.toFixed(1));
			pointGate?.setAttribute("cy", y.toFixed(1));
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
			if (dimTags[1]) dimTags[1].hidden = mode === "tall";
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
			const at = -section.getBoundingClientRect().top;
			const scrolled = Math.abs(at - u) > 1e-3;
			u = at;
			if (!seeded || still.matches) {
				s = u;
				seeded = true;
			} else s += (u - s) * (1 - Math.exp(-dt / TAU_SCROLL));
			if (Math.abs(u - s) < 0.25) s = u;
			beat = beatAt(u, beats, beat);
			setState(cue, beat === "title" && u < CUE_PX);
			const measured = s >= measure[0] && s <= measure[1];
			const shown = measured && !measuring;
			measuring = measured;
			setState(lifeInk, measuring);
			setState(dimsLayer, measuring);

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
				if (scrolled || Math.abs(u - s) > 0.5) {
					velocity = 0;
					spin *= Math.exp(-dt / TAU_RETURN);
				}
			}
			const take = track(s, beats, shots, still.matches);
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

			let index = -1;
			if (beat === "parts")
				for (let k = 0; k < marks.length; k++) if (u >= marks[k]) index = k;
			if (index !== active) {
				active = index;
				mark(active);
			}
			const focus = index >= 0 ? TAGS[index].part : null;
			const turned = focus !== pointPart;
			if (turned) {
				pointFrom = focus && pointAt && !still.matches ? pointAt : null;
				if (!focus) pointAt = null;
				pointT0 = now;
				pointPart = focus;
			}
			setState(pointInk, focus !== null);

			const signature = [
				view.yaw.toFixed(5),
				view.pitch.toFixed(5),
				view.scale.toFixed(3),
				view.cx.toFixed(2),
				view.cy.toFixed(2),
				view.explode.toFixed(4),
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
					if (!arrived && !still.matches && beat === "title" && u < CUE_PX) {
						arrival = { t0: now, amount: ARRIVE };
					}
					arrived = true;
				}
			} else gaps.length = 0;
			if (stage && measuring && (fresh || shown)) dims(view);
			if (stage && focus && (fresh || turned || pointFrom))
				point(view, focus, now);

			const moving =
				Math.abs(u - s) > 1e-3 ||
				pointFrom !== null ||
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

		const io = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible) {
				seeded = false;
				kick();
			}
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
		ro.observe(head);
		ro.observe(flow);
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
			stage?.dispose();
			stage = null;
		};
	}, []);

	return (
		<section className="vg-hero" ref={root} aria-labelledby="vg-hero-name">
			<header className="vg-hero__head">
				<p className="vg-eyebrow">Launched September 5, 1977</p>
				<h2 id="vg-hero-name" className="vg-hero__wordmark">
					Voyager 1<span className="vg-stop">.</span>
				</h2>
				<p className="vg-hero__lede">
					The farthest thing people have ever made. Still switched on.
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
			</header>
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
					<g className="vg-hero__layer" data-ink="point" data-state="wait">
						<path data-pointline="" data-hot="" />
						<circle data-pointring="" data-hot="" r="4.5" />
						<circle
							data-pointgate=""
							data-hot=""
							className="vg-hero__pip"
							r="2.5"
						/>
					</g>
				</svg>
				<div
					className="vg-hero__dims vg-hero__layer"
					data-state="wait"
					aria-hidden="true"
				>
					<p className="vg-hero__dim">13 m</p>
					<p className="vg-hero__dim">3.7 m</p>
				</div>
				<p
					className="vg-hero__cue vg-hero__layer"
					data-state="in"
					aria-hidden="true"
				>
					Scroll to take it apart. Drag to turn it.
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
			<div className="vg-hero__flow" aria-hidden="true">
				<div className="vg-hero__block" data-block="">
					<p className="vg-hero__big">
						Built for a five‑year trip to Jupiter and Saturn.
						<span className="vg-dim">
							{" "}
							Still working, forty‑nine years later.
						</span>
					</p>
				</div>
				<div className="vg-hero__block" data-block="">
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
					<ol className="vg-hero__list">
						{TAGS.map((t, i) => (
							<li key={t.part} className="vg-hero__item">
								<p className="vg-hero__count">
									{i + 1} / {TAGS.length}
								</p>
								<p className="vg-hero__item-name">{t.name}</p>
								<Spec tag={t} />
							</li>
						))}
					</ol>
				</div>
				<div className="vg-hero__block" data-block="">
					<p className="vg-hero__big">
						It is looking at you<span className="vg-stop">.</span>
						<span className="vg-dim">
							{" "}
							Its dish has to hold Earth inside a radio beam just 0.6° wide.
						</span>
					</p>
				</div>
			</div>
		</section>
	);
}
