"use client";

import type { Fds } from "@zeyaddeeb/wasm";
import {
	type CSSProperties,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useWasm } from "@/lib/hooks/use-wasm";
import { Code } from "./code";
import {
	type Board,
	CHIP,
	CHIPS,
	COLS,
	chipAt,
	chipOf,
	edge,
	FREE,
	type Gap,
	gapAt,
	gapsOf,
	hex,
	type Move,
	board as measure,
	origin,
	plan,
	ROWS,
	snap,
	WORDS,
	wordAt,
} from "./fds-board";

const STRANDED = [16, 17, 18, 19];
const NAMES = [
	"pack_science",
	"pack_engineering",
	"frame_header",
	"frame_sync",
];
const LENS = [80, 72, 56, 48];
const DEAD = 21;
const STUCK = 0xaaaa;
const FIELD_NT = 0.48;
const DECODE = 18;
const POKE_MS = 3200;
const PATCH_MS = 4200;
const FADE_MS = 160;
const HOLD_MS = 2400;
const SLOP = 6;
const CODE = ["relocate", "fits", "patch", "frame"];
const LEFT = ["", "One routine", "Two routines", "Three routines"];

const LINES = {
	sync: "frame[..2].copy_from_slice(&SYNC);",
	stuck: "return vec![STUCK; FRAME_WORDS];",
	patch: "patched += 1;",
	refuse: 'return Err(format!("{} words do not fit',
};

type Stage = "healthy" | "stuck" | "poking" | "failed" | "sending" | "fixed";
type Actions = "replay" | "poke" | "fix" | "reset";
type Tone = "red" | "blue" | "gold";

const STEPS: {
	day: string;
	year: string;
	iso: string;
	tone: Tone;
	text: string;
}[] = [
	{
		day: "Nov 14",
		year: "2023",
		iso: "2023-11-14",
		tone: "red",
		text: "Telemetry turns into a repeating pattern of ones and zeros.",
	},
	{
		day: "Mar 1",
		year: "2024",
		iso: "2024-03-01",
		tone: "blue",
		text: "Engineers send a “poke” asking the FDS to read back its memory.",
	},
	{
		day: "Mar 3",
		year: "2024",
		iso: "2024-03-03",
		tone: "red",
		text: "The readout shows one chip, about 3% of FDS memory, has failed.",
	},
	{
		day: "Apr 18",
		year: "2024",
		iso: "2024-04-18",
		tone: "blue",
		text: "The first relocated code goes up, split across other addresses.",
	},
	{
		day: "Apr 20",
		year: "2024",
		iso: "2024-04-20",
		tone: "gold",
		text: "Engineering data comes back readable.",
	},
	{
		day: "Jun 13",
		year: "2024",
		iso: "2024-06-13",
		tone: "gold",
		text: "All four working science instruments return data.",
	},
];

const REACHED: Record<Stage, number> = {
	healthy: 0,
	stuck: 1,
	poking: 2,
	failed: 3,
	sending: 4,
	fixed: 5,
};

const LIVE: Partial<Record<Stage, number>> = { poking: 1, sending: 3 };

const DOT: Record<Stage, Tone> = {
	healthy: "gold",
	stuck: "red",
	poking: "blue",
	failed: "red",
	sending: "blue",
	fixed: "gold",
};

const INK = "#f5f2e9";
const USED = "rgba(245, 242, 233, 0.22)";
const EMPTY = "rgba(245, 242, 233, 0.06)";
const GOLD = "#e8b355";
const LIT = "rgba(232, 179, 85, 0.72)";
const RED = "#d2593f";
const HATCH = "rgba(210, 89, 63, 0.7)";
const DEAD_BG = "#1f1714";

interface Scene {
	owners: Uint8Array;
	dead: number | null;
	fit: Gap[];
	ghost: Gap | null;
	focus: number | null;
}

interface Frame {
	id: number;
	words: number[];
}

const word4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

const hm = (hours: number) =>
	`${Math.floor(hours)} h ${String(Math.floor((hours % 1) * 60)).padStart(2, "0")} m`;

function edges(b: Board, dpr: number) {
	const step = b.chip + b.gap;
	const line = (k: number) =>
		Array.from({ length: 17 }, (_, i) =>
			Math.round((k * step + i * b.cell) * dpr),
		);
	return {
		xs: Array.from({ length: COLS }, (_, c) => line(c)),
		ys: Array.from({ length: ROWS }, (_, r) => line(r)),
	};
}

function hatch(
	ctx: CanvasRenderingContext2D,
	x: number[],
	y: number[],
	dpr: number,
) {
	const x0 = x[0];
	const y0 = y[0];
	const w = x[16] - x0;
	const h = y[16] - y0;
	ctx.fillStyle = DEAD_BG;
	ctx.fillRect(x0, y0, w, h);
	ctx.save();
	ctx.beginPath();
	ctx.rect(x0, y0, w, h);
	ctx.clip();
	ctx.beginPath();
	const gap = Math.round(6 * dpr);
	for (let k = -h; k < w; k += gap) {
		ctx.moveTo(x0 + k, y0 + h);
		ctx.lineTo(x0 + k + h, y0);
	}
	ctx.strokeStyle = HATCH;
	ctx.lineWidth = Math.max(1, Math.round(dpr));
	ctx.stroke();
	ctx.restore();
	const f = Math.round(2 * dpr);
	ctx.strokeStyle = RED;
	ctx.lineWidth = f;
	ctx.strokeRect(x0 + f / 2, y0 + f / 2, w - f, h - f);
}

function paint(ctx: CanvasRenderingContext2D, b: Board, dpr: number, s: Scene) {
	const { xs, ys } = edges(b, dpr);
	const lit = new Uint8Array(WORDS);
	for (const g of s.fit) lit.fill(1, g.base, g.base + g.len);
	if (s.ghost) lit.fill(2, s.ghost.base, s.ghost.base + s.ghost.len);
	const key = (w: number) => (lit[w] ? -lit[w] : s.owners[w]);
	const colorOf = (w: number) => {
		if (lit[w] === 2) return INK;
		if (lit[w] === 1) return LIT;
		const own = s.owners[w];
		if (own === FREE) return EMPTY;
		if (STRANDED.includes(own)) return own === s.focus ? GOLD : INK;
		return USED;
	};
	const mesh = b.cell * dpr >= 4 ? 1 : 0;
	const sep = Math.max(1, Math.round(dpr));
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	for (let c = 0; c < CHIPS; c++) {
		const x = xs[c % COLS];
		const y = ys[Math.floor(c / COLS)];
		if (c === s.dead) {
			hatch(ctx, x, y, dpr);
			continue;
		}
		for (let o = 0; o < CHIP; o++) {
			const w = c * CHIP + o;
			const color = colorOf(w);
			const i = o % 16;
			const j = Math.floor(o / 16);
			const k = key(w);
			const soft =
				color === USED || color === EMPTY || color === LIT ? mesh : 0;
			const right = i < 15 ? (key(w + 1) !== k ? sep : soft) : 0;
			const below = j < 15 ? (key(w + 16) !== k ? sep : soft) : 0;
			ctx.fillStyle = color;
			ctx.fillRect(
				x[i],
				y[j],
				x[i + 1] - x[i] - right,
				y[j + 1] - y[j] - below,
			);
		}
	}
}

function useSeen(ref: RefObject<HTMLElement | null>) {
	const [seen, setSeen] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		let near = false;
		const sync = () => setSeen(near && document.visibilityState === "visible");
		const io = new IntersectionObserver(
			([e]) => {
				near = e.isIntersecting;
				sync();
			},
			{ rootMargin: "50% 0px" },
		);
		io.observe(el);
		document.addEventListener("visibilitychange", sync);
		return () => {
			io.disconnect();
			document.removeEventListener("visibilitychange", sync);
		};
	}, [ref]);
	return seen;
}

export function ChipRescue({ watts, light }: { watts: number; light: number }) {
	const { wasm } = useWasm();
	const root = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const clock = useRef<HTMLSpanElement>(null);
	const tray = useRef<(HTMLButtonElement | null)[]>([]);
	const ground = useRef<Fds | null>(null);
	const craft = useRef<Fds | null>(null);
	const stageRef = useRef<Stage>("healthy");
	const wattsRef = useRef(watts);
	const serial = useRef(0);
	const hold = useRef(0);
	const flight = useRef(0);
	const fade = useRef(0);
	const geo = useRef<Board | null>(null);
	const sceneRef = useRef<Scene | null>(null);
	const layers = useRef<{
		next: HTMLCanvasElement | null;
		prev: HTMLCanvasElement | null;
	}>({
		next: null,
		prev: null,
	});
	const pointer = useRef<"mouse" | "touch">("mouse");
	const actions = useRef<HTMLDivElement>(null);
	const refocus = useRef(false);

	const [stage, setStage] = useState<Stage>("healthy");
	const [science, setScience] = useState(false);
	const [owners, setOwners] = useState<Uint8Array | null>(null);
	const [moves, setMoves] = useState<Move[]>([]);
	const [dead, setDead] = useState<number | null>(null);
	const [picked, setPicked] = useState<number | null>(null);
	const [ghost, setGhost] = useState<number | null>(null);
	const [focus, setFocus] = useState<number | null>(null);
	const [note, setNote] = useState("");
	const [frames, setFrames] = useState<Frame[]>([]);
	const [hot, setHot] = useState({ line: LINES.sync, n: 0 });
	const [coarse, setCoarse] = useState(false);
	const seen = useSeen(root);

	wattsRef.current = watts;

	const names = useMemo(
		() => (wasm ? STRANDED.map((r) => wasm.routine_name(r)) : NAMES),
		[wasm],
	);
	const lens = useMemo(
		() => (wasm ? STRANDED.map((r) => wasm.routine_len(r)) : LENS),
		[wasm],
	);
	const lenOf = useCallback(
		(r: number) => lens[STRANDED.indexOf(r)] ?? 0,
		[lens],
	);
	const nameOf = useCallback(
		(r: number) => {
			const i = STRANDED.indexOf(r);
			if (i >= 0) return names[i];
			return wasm ? wasm.routine_name(r) : `routine ${r}`;
		},
		[names, wasm],
	);

	const build = useCallback(
		(fail: boolean, list: Move[]) => {
			if (!wasm) return null;
			const f = new wasm.Fds();
			if (fail) f.fail();
			for (const m of list) f.relocate(m.routine, m.base);
			return f;
		},
		[wasm],
	);

	const go = useCallback((next: Stage) => {
		stageRef.current = next;
		setStage(next);
		setNote("");
		setPicked(null);
		setGhost(null);
	}, []);

	const flash = useCallback((line: string) => {
		hold.current = performance.now() + HOLD_MS;
		setHot((h) => ({ line, n: h.n + 1 }));
	}, []);

	const tick = useCallback(() => {
		const c = craft.current;
		if (!c) return;
		const words = Array.from(c.frame(wattsRef.current, FIELD_NT)).slice(0, 6);
		serial.current += 1;
		const id = serial.current;
		setFrames((prev) => [{ id, words }, ...prev].slice(0, 6));
		const bad = words[0] === STUCK;
		if (!bad && stageRef.current === "fixed") setScience(true);
		if (performance.now() > hold.current)
			setHot((h) => ({ line: bad ? LINES.stuck : LINES.sync, n: h.n + 1 }));
	}, []);

	useEffect(() => {
		if (!wasm) return;
		ground.current = build(false, []);
		craft.current = build(false, []);
		setOwners(ground.current?.owners() ?? null);
		const c = craft.current;
		if (c) {
			const seed: Frame[] = [];
			for (let i = 0; i < 6; i++) {
				serial.current += 1;
				seed.unshift({
					id: serial.current,
					words: Array.from(c.frame(wattsRef.current, FIELD_NT)).slice(0, 6),
				});
			}
			setFrames(seed);
		}
		return () => {
			cancelAnimationFrame(flight.current);
			ground.current?.free();
			craft.current?.free();
			ground.current = null;
			craft.current = null;
		};
	}, [wasm, build]);

	useEffect(() => {
		if (!seen || !owners) return;
		const id = window.setInterval(tick, 900);
		return () => window.clearInterval(id);
	}, [seen, owners, tick]);

	useEffect(() => {
		const mq = window.matchMedia("(pointer: coarse)");
		const sync = () => setCoarse(mq.matches);
		sync();
		mq.addEventListener("change", sync);
		return () => mq.removeEventListener("change", sync);
	}, []);

	const known = stage === "failed" || stage === "sending" || stage === "fixed";
	const chip = known ? dead : null;
	const placed = useMemo(() => new Set(moves.map((m) => m.routine)), [moves]);
	const left = useMemo(() => STRANDED.filter((r) => !placed.has(r)), [placed]);
	const gaps = useMemo(
		() => (owners ? gapsOf(owners, chip) : []),
		[owners, chip],
	);
	const feasible = useMemo(
		() =>
			stage !== "failed" ||
			plan(
				gaps,
				left.map((id) => ({ id, len: lenOf(id) })),
			) !== null,
		[stage, gaps, left, lenOf],
	);
	const ready = stage === "failed" && left.length === 0;
	const picking = stage === "failed" && picked !== null;
	const pickLen = picking && picked !== null ? lenOf(picked) : 0;
	const fit = useMemo(
		() => (pickLen ? gaps.filter((g) => g.len >= pickLen) : []),
		[gaps, pickLen],
	);

	const scene = useMemo<Scene | null>(
		() =>
			owners
				? {
						owners,
						dead: chip,
						fit,
						ghost:
							ghost !== null && pickLen ? { base: ghost, len: pickLen } : null,
						focus,
					}
				: null,
		[owners, chip, fit, ghost, pickLen, focus],
	);

	const draw = useCallback((animate: boolean) => {
		const cv = canvas.current;
		const s = sceneRef.current;
		if (!cv || !s) return;
		const w = cv.clientWidth;
		const h = cv.clientHeight;
		if (!w || !h) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const W = Math.round(w * dpr);
		const H = Math.round(h * dpr);
		const gap =
			Number.parseFloat(getComputedStyle(cv).getPropertyValue("--fds-gap")) ||
			8;
		const b = measure(w, gap);
		geo.current = b;
		const l = layers.current;
		l.next ??= document.createElement("canvas");
		l.prev ??= document.createElement("canvas");
		const sized = cv.width === W && cv.height === H;
		if (l.next.width !== W || l.next.height !== H) {
			l.next.width = W;
			l.next.height = H;
		}
		const nctx = l.next.getContext("2d");
		const ctx = cv.getContext("2d");
		if (!nctx || !ctx) return;
		paint(nctx, b, dpr, s);
		cancelAnimationFrame(fade.current);
		const still =
			!animate ||
			!sized ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (still) {
			if (!sized) {
				cv.width = W;
				cv.height = H;
			}
			ctx.clearRect(0, 0, W, H);
			ctx.drawImage(l.next, 0, 0);
			return;
		}
		const prev = l.prev;
		prev.width = W;
		prev.height = H;
		prev.getContext("2d")?.drawImage(cv, 0, 0);
		const next = l.next;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / FADE_MS);
			ctx.globalAlpha = 1;
			ctx.clearRect(0, 0, W, H);
			ctx.drawImage(next, 0, 0);
			ctx.globalAlpha = 1 - t * (2 - t);
			ctx.drawImage(prev, 0, 0);
			ctx.globalAlpha = 1;
			if (t < 1) fade.current = requestAnimationFrame(step);
		};
		fade.current = requestAnimationFrame(step);
	}, []);

	useEffect(() => {
		const first = sceneRef.current === null;
		sceneRef.current = scene;
		draw(!first);
	}, [scene, draw]);

	useEffect(() => {
		const cv = canvas.current;
		if (!cv) return;
		const ro = new ResizeObserver(() => draw(false));
		ro.observe(cv);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(fade.current);
		};
	}, [draw]);

	const fly = (ms: number, done: () => void) => {
		const el = root.current;
		const start = performance.now();
		let last = 0;
		cancelAnimationFrame(flight.current);
		el?.style.setProperty("--p", "0");
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / ms);
			el?.style.setProperty("--p", t.toFixed(4));
			if (clock.current && (now - last > 100 || t === 1)) {
				last = now;
				clock.current.textContent = hm(t * light * 2);
			}
			if (t < 1) flight.current = requestAnimationFrame(step);
			else {
				flight.current = 0;
				done();
			}
		};
		flight.current = requestAnimationFrame(step);
	};

	const replay = () => {
		ground.current?.free();
		craft.current?.free();
		ground.current = build(true, []);
		craft.current = build(true, []);
		setMoves([]);
		setDead(null);
		setScience(false);
		setOwners(ground.current?.owners() ?? null);
		go("stuck");
		tick();
	};

	const readout = () => {
		const c = craft.current;
		if (!c || !wasm) return;
		const copy = new wasm.Fds();
		const wrong = new Array<number>(CHIPS).fill(0);
		for (let w = 0; w < WORDS; w++)
			if (c.peek(w) !== copy.peek(w)) wrong[chipOf(w)]++;
		copy.free();
		const most = Math.max(...wrong);
		const found = most > 0 ? wrong.indexOf(most) : DEAD;
		setDead(found);
		go("failed");
		setNote(
			`Chip ${found} reads back as noise: ${most} of ${CHIP} words wrong.`,
		);
	};

	const poke = () => {
		go("poking");
		fly(POKE_MS, readout);
	};

	const place = (routine: number, base: number) => {
		const f = ground.current;
		if (!f) return;
		try {
			const patched = f.relocate(routine, base);
			setMoves((m) => [...m, { routine, base }]);
			setOwners(f.owners());
			setPicked(null);
			setGhost(null);
			flash(LINES.patch);
			setNote(
				`${nameOf(routine)} moved to ${hex(base)}. ${patched} ${patched === 1 ? "address" : "addresses"} patched.`,
			);
		} catch (err) {
			flash(LINES.refuse);
			setNote(String(err));
		}
	};

	const refuse = (routine: number, gap: Gap) => {
		try {
			ground.current?.relocate(routine, gap.base);
		} catch {
			flash(LINES.refuse);
		}
		setNote(
			`That gap holds ${gap.len} words. ${nameOf(routine)} needs ${lenOf(routine)}.`,
		);
	};

	const undo = () => {
		const next = moves.slice(0, -1);
		ground.current?.free();
		ground.current = build(true, next);
		setMoves(next);
		setOwners(ground.current?.owners() ?? null);
		setPicked(null);
		setGhost(null);
		setNote("");
	};

	const solve = () => {
		const found = plan(
			gaps,
			left.map((id) => ({ id, len: lenOf(id) })),
		);
		if (!found) {
			setNote("Best fit can’t finish from here. Undo a move first.");
			return;
		}
		const list = [...moves, ...found];
		ground.current?.free();
		ground.current = build(true, list);
		setMoves(list);
		setOwners(ground.current?.owners() ?? null);
		setPicked(null);
		setGhost(null);
		flash(LINES.patch);
		setNote("Best fit, largest routine first.");
	};

	const send = () => {
		go("sending");
		fly(PATCH_MS, () => {
			craft.current?.free();
			craft.current = build(true, moves);
			go("fixed");
		});
	};

	const reset = () => {
		cancelAnimationFrame(flight.current);
		ground.current?.free();
		craft.current?.free();
		ground.current = build(false, []);
		craft.current = build(false, []);
		setMoves([]);
		setDead(null);
		setScience(false);
		setOwners(ground.current?.owners() ?? null);
		go("healthy");
		tick();
	};

	const act = (run: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
		refocus.current = e.detail === 0;
		run();
	};

	const local = (e: { clientX: number; clientY: number }) => {
		const r = canvas.current?.getBoundingClientRect();
		return r
			? { x: e.clientX - r.left, y: e.clientY - r.top }
			: { x: -1, y: -1 };
	};

	const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
		pointer.current = e.pointerType === "mouse" ? "mouse" : "touch";
	};

	const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
		if (e.pointerType !== "mouse" || !picking || !geo.current) return;
		const { x, y } = local(e);
		const w = wordAt(geo.current, x, y);
		const g = w < 0 ? undefined : gapAt(gaps, w);
		const base = g && g.len >= pickLen ? edge(g, pickLen, w, w + 1) : null;
		setGhost(base);
	};

	const aim = (b: Board, x: number, y: number) => {
		const lit = (c: number) => snap(gaps, c, pickLen, chip).kind === "fit";
		const near = chipAt(b, x, y, true);
		if (lit(near)) return near;
		let best = near;
		let reach = SLOP;
		for (let c = 0; c < CHIPS; c++) {
			const o = origin(b, c);
			const d = Math.hypot(
				Math.max(0, o.x - x, x - o.x - b.chip),
				Math.max(0, o.y - y, y - o.y - b.chip),
			);
			if (d <= reach && lit(c)) {
				best = c;
				reach = d;
			}
		}
		return best;
	};

	const onBoard = (e: MouseEvent<HTMLCanvasElement>) => {
		if (!picking || picked === null || !geo.current || !owners) return;
		const { x, y } = local(e);
		if (pointer.current === "touch") {
			const c = aim(geo.current, x, y);
			const s = snap(gaps, c, pickLen, chip);
			if (s.kind === "fit") place(picked, s.base);
			else if (s.kind === "small") refuse(picked, s.gap);
			else if (s.kind === "dead")
				setNote(`Chip ${c} is dead. Tap a chip with a lit gap.`);
			else setNote(`Chip ${c} has no free words. Tap a chip with a lit gap.`);
			return;
		}
		const w = wordAt(geo.current, x, y);
		if (w < 0) return;
		if (chipOf(w) === chip) {
			setNote(`Chip ${chip} is dead. Nothing can live there now.`);
			return;
		}
		const g = gapAt(gaps, w);
		if (!g) {
			setNote(`${hex(w)} belongs to ${nameOf(owners[w])}. Click a lit gap.`);
			return;
		}
		if (g.len < pickLen) refuse(picked, g);
		else place(picked, edge(g, pickLen, w, w + 1));
	};

	const onBoardKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
		if (!picking || picked === null) return;
		if (e.key === "Escape") {
			e.preventDefault();
			const i = STRANDED.indexOf(picked);
			setPicked(null);
			setGhost(null);
			tray.current[i]?.focus({ preventScroll: true });
			return;
		}
		if ((e.key === "Enter" || e.key === " ") && ghost !== null) {
			e.preventDefault();
			place(picked, ghost);
			const next = left.find((r) => r !== picked);
			if (next !== undefined)
				tray.current[STRANDED.indexOf(next)]?.focus({ preventScroll: true });
			return;
		}
		const d =
			e.key === "ArrowRight" || e.key === "ArrowDown"
				? 1
				: e.key === "ArrowLeft" || e.key === "ArrowUp"
					? -1
					: 0;
		if (!d || !fit.length) return;
		e.preventDefault();
		const i = fit.findIndex(
			(g) => ghost !== null && ghost >= g.base && ghost < g.base + g.len,
		);
		const n =
			i < 0 ? (d > 0 ? 0 : fit.length - 1) : (i + d + fit.length) % fit.length;
		setGhost(fit[n].base);
		setNote(
			`Gap ${n + 1} of ${fit.length}: ${fit[n].len} words at ${hex(fit[n].base)}. Enter places it.`,
		);
	};

	const pick = (r: number, keyboard: boolean) => {
		if (stage !== "failed" || placed.has(r)) return;
		const next = picked === r ? null : r;
		setPicked(next);
		setGhost(null);
		setNote("");
		if (next !== null && keyboard) {
			const len = lenOf(next);
			const first = gaps.find((g) => g.len >= len);
			if (first) setGhost(first.base);
			canvas.current?.focus({ preventScroll: true });
		}
	};

	const visible = (r: number) =>
		stage === "healthy" ||
		stage === "stuck" ||
		stage === "poking" ||
		placed.has(r);

	const n = REACHED[stage] + (science ? 1 : 0);
	const live = LIVE[stage];
	const latest = n > 0 ? STEPS[n - 1] : null;
	const caption = latest ?? STEPS[0];

	const statusText: ReactNode = (() => {
		if (stage === "healthy") return "FDS healthy. Telemetry decoding.";
		if (stage === "stuck") return "Stuck on AAAA. Ask the FDS what it holds.";
		if (stage === "poking" || stage === "sending")
			return (
				<>
					{stage === "poking" ? "Poke" : "Patch"} in flight ·{" "}
					<span ref={clock} className="vg-fds__clock" aria-hidden="true">
						{hm(0)}
					</span>
				</>
			);
		if (stage === "fixed")
			return science
				? "Patched. Science data is back."
				: "Patched. Engineering data reads again.";
		if (ready) return "Every routine moved. Send the patch.";
		if (!feasible) return "Stranded: the rest can’t all fit. Undo a move.";
		if (left.length === 4)
			return `Chip ${dead ?? DEAD} is dead. Move its four routines.`;
		return `${LEFT[left.length]} left to move.`;
	})();

	const hint = (() => {
		if (stage === "healthy")
			return `Chip ${DEAD} holds the four routines that build every frame.`;
		if (stage === "stuck")
			return "Nothing on the ground says which part failed.";
		if (stage === "poking")
			return `The poke asks the FDS to read back all ${WORDS.toLocaleString("en-US")} words.`;
		if (stage === "sending") return "The patch goes up at 16 bits per second.";
		if (stage === "fixed")
			return science ? "Frames decode again." : "Waiting for the next frame.";
		if (ready) return `Nothing is left in chip ${dead ?? DEAD}.`;
		if (picked !== null)
			return `${nameOf(picked)} needs ${lenOf(picked)} words. ${coarse ? "Tap a chip with a lit gap." : "Click a lit gap."}`;
		return coarse
			? "Pick a routine, then tap a chip with a lit gap."
			: "Pick a routine, then click a lit gap.";
	})();

	const newest = frames[0]?.words;
	const bad = newest?.[0] === STUCK;
	const decode = (
		newest
			? bad
				? "No sync"
				: `${(newest[3] / 10).toFixed(1)}\u00a0W · ${(newest[4] / 1000).toFixed(2)}\u00a0nT`
			: ""
	).padStart(DECODE, "\u00a0");

	const boardLabel = picking
		? `FDS memory board. ${fit.length} gaps fit ${nameOf(picked ?? 0)}. Arrow keys choose a gap, Enter places it, Escape cancels.`
		: `FDS memory, ${CHIPS} chips of ${CHIP} words.${chip !== null ? ` Chip ${chip} is dead.` : ""}`;

	const set: Actions =
		stage === "healthy"
			? "replay"
			: stage === "stuck" || stage === "poking"
				? "poke"
				: stage === "fixed"
					? "reset"
					: "fix";
	const flying = stage === "poking" || stage === "sending";

	useEffect(() => {
		const box = actions.current;
		if (!refocus.current || !box || !set) return;
		const id = requestAnimationFrame(() => {
			const shown = box.querySelectorAll<HTMLButtonElement>(
				".vg-fds__set[data-on] button:not(:disabled)",
			);
			const el = document.activeElement;
			if ([...shown].some((b) => b === el)) {
				refocus.current = false;
				return;
			}
			const next = shown[shown.length - 1];
			if (!next) return;
			next.focus({ preventScroll: true });
			refocus.current = false;
		});
		return () => cancelAnimationFrame(id);
	}, [set, ready, flying]);

	return (
		<div
			ref={root}
			className="vg-fds vg-grid"
			data-stage={stage}
			style={{ "--p": 0 } as CSSProperties}
		>
			<div className="vg-fds__time">
				<ol
					className="vg-fds__line vg-tilerow"
					aria-label="The rescue, 2023 to 2024"
				>
					{STEPS.map((s, i) => (
						<li
							key={s.iso}
							className="vg-tile vg-fds__step"
							data-tone={s.tone}
							data-state={i === live ? "live" : i < n ? "done" : undefined}
							aria-current={latest === s ? "step" : undefined}
						>
							<time dateTime={s.iso}>
								{s.day}
								<span className="vg-fds__year">, {s.year}</span>
							</time>
							<p>{s.text}</p>
						</li>
					))}
				</ol>
				<p className="vg-fds__caption" data-on={latest ? "true" : undefined}>
					<time
						dateTime={caption.iso}
					>{`${caption.day}, ${caption.year}`}</time>{" "}
					{caption.text}
				</p>
			</div>
			<div className="vg-fds__bench">
				<div className="vg-fds__top">
					<p className="vg-fds__status" data-dot={DOT[stage]} role="status">
						<i aria-hidden="true" />
						<span key={stage} className="vg-fds__say">
							{statusText}
						</span>
					</p>
					<div ref={actions} className="vg-fds__actions">
						<div
							className="vg-fds__set"
							data-on={set === "replay" || undefined}
						>
							<button
								type="button"
								className="vg-button vg-button--red"
								disabled={!owners}
								onClick={act(replay)}
							>
								Replay November 14, 2023
							</button>
						</div>
						<div className="vg-fds__set" data-on={set === "poke" || undefined}>
							<button
								type="button"
								className="vg-button vg-fds__poke"
								data-flight={stage === "poking" || undefined}
								disabled={stage !== "stuck"}
								onClick={act(poke)}
							>
								Send a poke
							</button>
						</div>
						<div className="vg-fds__set" data-on={set === "fix" || undefined}>
							<button
								type="button"
								className="vg-button"
								onClick={act(undo)}
								disabled={stage !== "failed" || !moves.length}
							>
								Undo
							</button>
							<button
								type="button"
								className="vg-button"
								onClick={act(solve)}
								disabled={stage !== "failed" || ready}
							>
								Best fit
							</button>
							<button
								type="button"
								className={`vg-button vg-fds__send${ready ? " vg-button--gold" : ""}`}
								data-flight={stage === "sending" || undefined}
								disabled={!ready}
								onClick={act(send)}
							>
								Send the patch
							</button>
						</div>
						<div className="vg-fds__set" data-on={set === "reset" || undefined}>
							<button type="button" className="vg-button" onClick={act(reset)}>
								Start over
							</button>
						</div>
					</div>
				</div>
				<figure className="vg-fds__fig">
					<canvas
						ref={canvas}
						className="vg-fds__board"
						data-picking={picking ? "true" : undefined}
						role={picking ? "application" : "img"}
						aria-label={boardLabel}
						tabIndex={picking ? 0 : -1}
						onPointerDown={onPointerDown}
						onPointerMove={onPointerMove}
						onPointerLeave={() => setGhost(null)}
						onClick={onBoard}
						onKeyDown={onBoardKey}
					/>
					<figcaption className="vg-fds__cap">
						<span className="vg-fds__note" aria-live="polite">
							{note || hint}
						</span>
					</figcaption>
				</figure>
				<div className="vg-fds__under">
					<div className="vg-fds__pack">
						<p className="vg-fds__key" aria-hidden="true">
							<span data-k="ink">Chip {DEAD}’s routines</span>
							<span data-k="used">Other code</span>
							<span data-k="free">Free</span>
						</p>
						<fieldset
							className="vg-fds__tray"
							aria-label={`Routines from chip ${DEAD}`}
							data-on={stage === "failed" ? "true" : undefined}
						>
							{STRANDED.map((r, i) => {
								const at = moves.find((m) => m.routine === r);
								const off = stage !== "failed" || !!at;
								return (
									<button
										key={r}
										ref={(el) => {
											tray.current[i] = el;
										}}
										type="button"
										className="vg-fds__routine"
										aria-pressed={picked === r}
										aria-disabled={off || undefined}
										data-placed={at ? "true" : undefined}
										onClick={(e) => pick(r, e.detail === 0)}
										onPointerEnter={(e) => {
											if (e.pointerType === "mouse" && visible(r)) setFocus(r);
										}}
										onPointerLeave={() => setFocus(null)}
										onFocus={() => {
											if (visible(r)) setFocus(r);
										}}
										onBlur={() => setFocus(null)}
									>
										<span className="vg-fds__rname">{names[i]}</span>
										<span className="vg-fds__rlen">
											{at ? `At ${hex(at.base)}` : `${lens[i]} words`}
										</span>
									</button>
								);
							})}
						</fieldset>
					</div>
					<div className="vg-fds__down" data-bad={bad ? "true" : undefined}>
						<p className="vg-fds__downhead">
							<span className="vg-eyebrow">Downlink</span>
							<span className="vg-fds__decode">{decode}</span>
						</p>
						<ol
							className="vg-fds__frames"
							aria-label="Newest telemetry frames first"
						>
							{frames.map((f, i) => (
								<li key={i ? `slot-${i}` : f.id}>
									{f.words.map(word4).join(" ")}
								</li>
							))}
						</ol>
					</div>
				</div>
			</div>
			<div className="vg-fds__code">
				<Code names={CODE} hot={hot.line} beat={hot.n} />
			</div>
		</div>
	);
}
