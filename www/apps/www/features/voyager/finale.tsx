"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { useEffect, useRef, useState } from "react";
import { duration, fix } from "./ephemeris";
import type { PartId } from "./model";
import type { Stage, View } from "./stage";
import { openUplink, type Sent, useSent } from "./uplink";
import "./finale.css";

type V3 = readonly [number, number, number];

interface Shape {
	dish: number;
	center: V3;
	science: V3;
	points: V3[];
}

interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

const MODEL = "/voyager/voyager.glb";
const SEED = Date.UTC(2026, 8, 28);
const DOT = 11;
const UNITS = ["h", "m", "s"] as const;
const FROM = 0.1;
const TO = 0.85;
const TAU = 0.07;
const NEAR_PITCH = 1.42;
const FAR_PITCH = 1.24;
const MARGIN = 16;
const SWEEP = Math.PI / 4;
const STEP = Math.PI / 36;
const TRIALS = [0, 0.3, 0.55];
const NONE: ReadonlySet<PartId> = new Set();
const FALLBACK: Shape = {
	dish: 3.66,
	center: [0, 1.44, 0],
	science: [1, 0, 0],
	points: [],
};

const clamp = (t: number) => Math.min(1, Math.max(0, t));
const smooth = (t: number) => {
	const c = clamp(t);

	return c * c * (3 - 2 * c);
};
const pad = (n: number) => String(n).padStart(2, "0");

const triple = (a: unknown): V3 | null =>
	Array.isArray(a) &&
	a.length === 3 &&
	a.every((n) => typeof n === "number" && Number.isFinite(n))
		? [a[0], a[1], a[2]]
		: null;

const along = (from: V3, to: V3, n: number): V3[] =>
	Array.from({ length: n + 1 }, (_, i) => {
		const t = i / n;

		return [
			from[0] + (to[0] - from[0]) * t,
			from[1] + (to[1] - from[1]) * t,
			from[2] + (to[2] - from[2]) * t,
		] as const;
	});

function describe(json: unknown): Shape | null {
	const nodes = (json as { nodes?: { extras?: Record<string, unknown> }[] })
		?.nodes;

	if (!Array.isArray(nodes)) return null;

	const root = nodes.find((n) => n.extras?.directions)?.extras;

	if (!root) return null;

	const dirs = root.directions as Record<string, unknown>;
	const science = triple((dirs.science as { dir?: unknown })?.dir);

	if (!science) return null;

	const dish = typeof root.dish === "number" ? root.dish : FALLBACK.dish;
	const points: V3[] = [];
	let center: V3 = FALLBACK.center;

	for (const n of nodes) {
		const e = n.extras;
		const c = triple(e?.center);
		const s = triple(e?.size);

		if (!e || typeof e.part !== "string" || !c || !s) continue;

		if (e.part === "mag" || e.part === "pws") continue;

		if (e.part === "hga") {
			center = c;

			for (let k = 0; k < 24; k++) {
				const a = (k / 24) * Math.PI * 2;

				points.push([
					c[0] + Math.cos(a) * (dish / 2),
					c[1],
					c[2] + Math.sin(a) * (dish / 2),
				]);
			}

			points.push([c[0], c[1] + s[1] / 2, c[2]]);

			continue;
		}

		for (let k = 0; k < 8; k++) {
			points.push([
				c[0] + (k & 1 ? 0.5 : -0.5) * s[0],
				c[1] + (k & 2 ? 0.5 : -0.5) * s[1],
				c[2] + (k & 4 ? 0.5 : -0.5) * s[2],
			]);
		}
	}

	const mag = dirs.mag as { root?: unknown; tip?: unknown } | undefined;
	const magRoot = triple(mag?.root);
	const magTip = triple(mag?.tip);

	if (magRoot && magTip) points.push(...along(magRoot, magTip, 16));

	if (Array.isArray(dirs.pws)) {
		for (const whip of dirs.pws as { root?: unknown; tip?: unknown }[]) {
			const from = triple(whip?.root);
			const to = triple(whip?.tip);

			if (from && to) points.push(...along(from, to, 8));
		}
	}

	return { dish, center, science, points };
}

async function header(url: string): Promise<unknown> {
	const res = await fetch(url);

	if (!res.ok || !res.body) return null;

	const reader = res.body.getReader();
	let bytes = new Uint8Array(0);
	let need = 20;
	let size = -1;

	while (bytes.byteLength < need) {
		const { done, value } = await reader.read();

		if (done || !value) break;

		const next = new Uint8Array(bytes.byteLength + value.byteLength);

		next.set(bytes);
		next.set(value, bytes.byteLength);
		bytes = next;

		if (size < 0 && bytes.byteLength >= 20) {
			const head = new DataView(bytes.buffer);

			if (head.getUint32(0, true) !== 0x46546c67) break;

			size = head.getUint32(12, true);
			need = 20 + size;
		}
	}

	reader.cancel().catch(() => {});

	if (size < 0 || bytes.byteLength < 20 + size) return null;

	return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + size)));
}

let shaped: Promise<Shape> | null = null;

function loadShape() {
	shaped ??= header(MODEL)
		.then((json) => describe(json) ?? FALLBACK)
		.catch(() => FALLBACK);

	return shaped;
}

function light(ms: number) {
	const d = duration(fix(ms).lightSeconds);

	return [pad(d.h), pad(d.m), pad(d.s)] as const;
}

function remaining(sent: Sent | null, now: number) {
	if (!sent) return null;

	const left = sent.at + sent.light * 1000 - now;

	if (left <= 0) return null;

	const d = duration(left / 1000);

	return `${d.h}\u202fh ${pad(d.m)}\u202fm`;
}

function inside(x: number, y: number, box: Box) {
	return x > box.left && x < box.right && y > box.top && y < box.bottom;
}

function within(node: HTMLElement, base: HTMLElement): Box {
	let x = 0;
	let y = 0;
	let n: HTMLElement | null = node;

	while (n && n !== base) {
		x += n.offsetLeft;
		y += n.offsetTop;
		n = n.offsetParent as HTMLElement | null;
	}

	return {
		left: x,
		top: y,
		right: x + node.offsetWidth,
		bottom: y + node.offsetHeight,
	};
}

export function Finale() {
	const root = useRef<HTMLElement>(null);
	const stick = useRef<HTMLDivElement>(null);
	const host = useRef<HTMLDivElement>(null);
	const copy = useRef<HTMLDivElement>(null);
	const rect = useRef<HTMLDivElement>(null);
	const time = useRef<HTMLParagraphElement>(null);
	const parts = useRef<(HTMLSpanElement | null)[]>([]);
	const left = useRef<HTMLSpanElement>(null);
	const sent = useSent();
	const current = useRef(sent);
	const [flying, setFlying] = useState(false);
	const first = light(SEED);

	useEffect(() => {
		current.current = sent;
	}, [sent]);

	useEffect(() => {
		const el = root.current;
		const box = stick.current;
		const into = host.current;

		if (!el || !box || !into) return;

		const still = window.matchMedia("(prefers-reduced-motion: reduce)");
		const coarse = window.matchMedia("(pointer: coarse)");
		let stage: Stage | null = null;
		let shape: Shape = FALLBACK;
		let canvas: HTMLCanvasElement | null = null;
		let abort: AbortController | null = null;
		let pending = 0;
		let visible = false;
		let near = false;
		let frame = 0;
		let timer = 0;
		let last = 0;
		let q = -1;
		let drawn = Number.NaN;
		let dirty = true;
		let shown = false;
		let w = 0;
		let h = 0;
		let span = 1;
		let dpr = 1;
		let yaw = 0;
		let s0 = 1;
		let s1 = 1;
		let tx = 0;
		let ty = 0;
		let fly = false;
		let stamp = "";

		const viewAt = (t: number, turn = yaw): View => ({
			yaw: turn,
			pitch: NEAR_PITCH + (FAR_PITCH - NEAR_PITCH) * t,
			scale: s0 * (s1 / s0) ** t,
			cx: tx,
			cy: ty,
			explode: 0,
			focus: null,
			off: NONE,
			heat: 0,
		});

		const aim = (s: Stage, view: View) => {
			const [px, py] = s.project(shape.center, view);

			view.cx += tx - px;
			view.cy += ty - py;

			return view;
		};

		const measure = () => {
			w = box.offsetWidth;
			h = box.offsetHeight;
			span = Math.max(1, el.offsetHeight - h - 1);

			const device = window.devicePixelRatio || 1;

			dpr = coarse.matches ? 1.5 : Math.min(2, Math.max(1.5, device));
			dirty = true;

			const s = stage;

			if (!s || !copy.current || !rect.current || !time.current) return;

			const c = within(copy.current, box);
			const m = within(rect.current, box);
			const n = within(time.current, box);

			s.resize(w, h, dpr);

			const side = m.left >= c.right - 1;

			const zone: Box = {
				left: c.left - MARGIN,
				top: c.top - MARGIN,
				right: c.right + MARGIN,
				bottom: c.bottom + MARGIN,
			};

			const mw = m.right - m.left;
			const mh = m.bottom - m.top;

			const target = side
				? Math.min(0.6 * (h - m.top), 0.8 * mw)
				: Math.min(0.6 * w, 0.62 * mh);

			tx = m.left + mw / 2;

			ty = side
				? Math.min(
						Math.max((n.top + n.bottom) / 2, m.top + target / 2 + 12),
						h - target / 2 - 12,
					)
				: m.top + mh / 2;

			s1 = DOT / shape.dish;
			s0 = target / shape.dish;

			const [sx, , sz] = shape.science;
			const up = -Math.atan2(sx, -sz);
			const primary = side ? up : up - Math.PI / 2;

			const rim = [0, 1, 2, 3].map((k): V3 => {
				const a = (k / 2) * Math.PI;

				return [
					shape.center[0] + Math.cos(a) * (shape.dish / 2),
					shape.center[1],
					shape.center[2] + Math.sin(a) * (shape.dish / 2),
				];
			});

			const across = (view: View) => {
				let most = 0;

				for (let k = 0; k < 2; k++) {
					const [ax, ay] = s.project(rim[k], view);
					const [bx, by] = s.project(rim[k + 2], view);

					most = Math.max(most, Math.hypot(ax - bx, ay - by));
				}

				return most;
			};

			for (let k = 0; k < 2; k++) {
				const got = across(aim(s, viewAt(0, primary)));

				if (got > 0) s0 *= target / got;
			}

			let best = primary;
			let score = Number.POSITIVE_INFINITY;

			for (const flip of [0, Math.PI]) {
				for (let o = -SWEEP; o <= SWEEP + 1e-6; o += STEP) {
					const turn = primary + flip + o;
					let hits = 0;

					for (const t of TRIALS) {
						const view = aim(s, viewAt(smooth(t), turn));

						for (const pt of shape.points) {
							const [x, y] = s.project(pt, view);

							if (inside(x, y, zone)) hits++;
						}
					}

					const cost = hits * 100 + Math.abs(o) + flip * 0.2;

					if (cost < score) {
						score = cost;
						best = turn;
					}
				}
			}

			yaw = best;
		};

		const progress = () => {
			if (still.matches) return 1;

			return clamp(-el.getBoundingClientRect().top / span);
		};

		const tick = () => {
			const now = Date.now();
			const [hh, mm, ss] = light(now);
			const next = `${hh}${mm}${ss}`;

			if (next !== stamp) {
				stamp = next;

				const [a, b, c] = parts.current;

				if (a) a.textContent = hh;

				if (b) b.textContent = mm;

				if (c) c.textContent = ss;
			}

			const rest = remaining(current.current, now);

			if (left.current && rest && left.current.textContent !== rest)
				left.current.textContent = rest;

			const on = rest !== null;

			if (on !== fly) {
				fly = on;
				setFlying(on);
			}
		};

		const paint = () => {
			const s = stage;

			if (!s || (!dirty && q === drawn)) return;

			dirty = false;
			drawn = q;
			s.draw(aim(s, viewAt(smooth((q - FROM) / (TO - FROM)))));

			if (shown || !canvas) return;

			shown = true;

			canvas.style.transition = still.matches
				? ""
				: "opacity 240ms cubic-bezier(0.22, 0.61, 0.36, 1)";

			canvas.style.opacity = "1";
		};

		const warm = () => {
			pending = 0;

			if (frame) return;

			q = progress();
			paint();
		};

		const draw = (now: number) => {
			frame = 0;

			const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));

			last = now;

			const p = progress();

			if (q < 0 || still.matches) q = p;
			else q += (p - q) * (1 - Math.exp(-dt / TAU));

			if (Math.abs(p - q) < 1e-4) q = p;

			paint();

			if (visible && q !== p) {
				frame = requestAnimationFrame(draw);
			}
		};

		const kick = () => {
			if (frame || !visible) return;

			last = performance.now();
			frame = requestAnimationFrame(draw);
		};

		const idle = (fn: () => void) =>
			typeof window.requestIdleCallback === "function"
				? window.requestIdleCallback(fn, { timeout: 700 })
				: window.setTimeout(fn, 60);

		const cancelIdle = (id: number) => {
			if (typeof window.cancelIdleCallback === "function")
				window.cancelIdleCallback(id);
			else window.clearTimeout(id);
		};

		const drop = () => {
			if (pending) cancelIdle(pending);

			pending = 0;

			const cv = canvas;

			canvas = null;
			cv?.remove();
			abort?.abort();
			abort = null;
			stage?.dispose();
			stage = null;
			shown = false;
		};

		const lost = (e: Event) => {
			if (e.target !== canvas) return;

			drop();

			if (near) schedule();
		};

		const build = () => {
			pending = 0;

			if (canvas || !near) return;

			const cv = document.createElement("canvas");

			cv.className = "vg-finale__canvas";
			cv.setAttribute("aria-hidden", "true");
			cv.style.opacity = "0";
			cv.addEventListener("webglcontextlost", lost);
			into.append(cv);
			canvas = cv;

			const ctl = new AbortController();

			abort = ctl;

			Promise.all([
				import("./stage").then(({ createStage }) =>
					createStage(cv, {
						shadow: coarse.matches ? 1024 : 2048,
						signal: ctl.signal,
					}),
				),
				loadShape(),
			])
				.then(([made, found]) => {
					if (ctl.signal.aborted || canvas !== cv) {
						made.dispose();

						return;
					}

					shape = found;
					stage = made;
					measure();
					q = -1;

					if (visible) kick();
					else pending = idle(warm);
				})
				.catch(() => {
					if (canvas !== cv) return;

					canvas = null;
					cv.remove();
				});
		};

		const schedule = () => {
			if (canvas || pending) return;

			pending = idle(build);
		};

		const approach = new IntersectionObserver(
			([entry]) => {
				if (!entry.isIntersecting) return;

				near = true;
				schedule();
			},
			{ rootMargin: "100% 0px" },
		);

		const leave = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) return;

				near = false;
				drop();
			},
			{ rootMargin: "200% 0px" },
		);

		const seen = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			window.clearInterval(timer);
			timer = 0;

			if (visible) {
				q = -1;
				tick();
				timer = window.setInterval(tick, 100);
				kick();
			}
		});

		const ro = new ResizeObserver(() => {
			measure();
			kick();
		});

		const scrolled = () => kick();

		const motion = () => {
			q = -1;
			dirty = true;
			kick();
		};

		approach.observe(el);
		leave.observe(el);
		seen.observe(el);
		ro.observe(box);
		window.addEventListener("scroll", scrolled, { passive: true });
		still.addEventListener("change", motion);
		tick();

		return () => {
			approach.disconnect();
			leave.disconnect();
			seen.disconnect();
			ro.disconnect();
			window.removeEventListener("scroll", scrolled);
			still.removeEventListener("change", motion);
			window.clearInterval(timer);
			cancelAnimationFrame(frame);
			near = false;
			drop();
		};
	}, []);

	return (
		<section className="vg-finale" ref={root} aria-label="Still listening">
			<div className="vg-finale__stick vg-grid" ref={stick}>
				<div
					className="vg-finale__stage"
					ref={host}
					role="img"
					aria-label="Voyager 1’s dish, lit and facing you, falling away to a point as you scroll."
				/>
				<div className="vg-rect vg-finale__rect" ref={rect} />
				<div className="vg-finale__copy" ref={copy} data-reveal="">
					<p className="vg-eyebrow">Still listening</p>
					<p className="vg-finale__time" ref={time}>
						<span className="sr-only">One-way light time: </span>
						{UNITS.map((unit, i) => (
							<span key={unit} className="vg-finale__part">
								<span
									ref={(n) => {
										parts.current[i] = n;
									}}
								>
									{first[i]}
								</span>
								<span className="vg-finale__unit">{unit}</span>
							</span>
						))}
					</p>
					<p className="vg-finale__line">
						Anything you send now arrives{" "}
						<strong>about this time{"\u00a0"}tomorrow.</strong>
					</p>
					<button
						type="button"
						className="vg-pill vg-finale__send"
						data-flight={flying ? "true" : undefined}
						onClick={() => openUplink()}
					>
						<span className="vg-finale__labels">
							<span
								className="vg-finale__label"
								data-on={flying ? undefined : "true"}
							>
								Send it a command
								<LifeArrow direction="right" />
							</span>
							<span
								className="vg-finale__label"
								data-on={flying ? "true" : undefined}
							>
								<span>
									In flight ·{" "}
									<span ref={left}>
										23{"\u202f"}h 59{"\u202f"}m
									</span>
								</span>
							</span>
						</span>
					</button>
				</div>
			</div>
		</section>
	);
}
