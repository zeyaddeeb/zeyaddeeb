"use client";

import {
	type CSSProperties,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	type RefObject,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	full,
	grouped,
	HYDROGEN_S,
	LINES,
	line,
	period,
	pulsars,
	rotation,
	seconds,
	side,
	ticks,
} from "./cover";
import { Cover, type Diagram, Disc, MAP, RING, TURN_MS } from "./cover-art";
import { PictureSound } from "./picture-sound";

const spots: {
	id: Diagram;
	tab: string;
	label: string;
	box: [number, number, number, number];
}[] = [
	{
		id: "speed",
		tab: "Speed",
		label: "The record from above",
		box: [115, 150, 410, 445],
	},
	{
		id: "length",
		tab: "Length",
		label: "The record from the side",
		box: [140, 462, 400, 592],
	},
	{
		id: "picture",
		tab: "Pictures",
		label: "How to draw the pictures",
		box: [465, 165, 855, 660],
	},
	{
		id: "pulsars",
		tab: "Pulsars",
		label: "The pulsar map",
		box: [105, 592, 745, 965],
	},
	{
		id: "hydrogen",
		tab: "Hydrogen",
		label: "The hydrogen atom",
		box: [588, 770, 756, 906],
	},
];

const titles: Record<Diagram, string> = {
	speed: "How fast to spin it",
	length: "How long a side plays",
	picture: "How to turn sound into pictures",
	pulsars: "Where it came from",
	hydrogen: "The unit behind every number",
};

const contents: {
	label: string;
	value: string;
	unit?: string;
	note: string;
}[] = [
	{ label: "Pictures", value: "115", note: "After the calibration circle" },
	{ label: "Languages", value: "55", note: "Greetings, Akkadian to\u00a0Wu" },
	{
		label: "Music",
		value: "90",
		unit: "min",
		note: "27 pieces, Bach to Chuck\u00a0Berry",
	},
	{ label: "Sounds of Earth", value: "35", note: "Surf, thunder, a\u00a0kiss" },
];

const OUT_MS = 140;
const LIT = "data-lit";

function useStill() {
	const [still, setStill] = useState(false);
	useEffect(() => {
		const q = window.matchMedia("(prefers-reduced-motion: reduce)");
		const set = () => setStill(q.matches);
		set();
		q.addEventListener("change", set);
		return () => q.removeEventListener("change", set);
	}, []);
	return still;
}

function useSwap<T>(value: T, still: boolean): [T, boolean] {
	const [shown, setShown] = useState(value);
	const [out, setOut] = useState(false);
	useEffect(() => {
		if (value === shown) {
			setOut(false);
			return;
		}
		if (still) {
			setShown(value);
			return;
		}
		setOut(true);
		const id = window.setTimeout(() => {
			setShown(value);
			setOut(false);
		}, OUT_MS);
		return () => window.clearTimeout(id);
	}, [value, shown, still]);
	return [shown, out];
}

function useStuck(ref: RefObject<HTMLDivElement | null>) {
	const [stuck, setStuck] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver(
			([e]) => {
				const top = e.rootBounds?.top ?? 0;
				setStuck(!e.isIntersecting && e.boundingClientRect.top < top + 1);
			},
			{ rootMargin: "-52px 0px 0px 0px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [ref]);
	return stuck;
}

function useReader(root: RefObject<HTMLDivElement | null>, on: boolean) {
	const spin = useRef<Animation | null>(null);

	useEffect(() => () => spin.current?.cancel(), []);

	useEffect(() => {
		const el = root.current;
		const group = el?.querySelector<SVGGElement>(".vg-spin");
		const cover = el?.querySelector<SVGSVGElement>(".vg-cover");
		if (!el || !group || !cover) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			spin.current?.cancel();
			spin.current = null;
			return;
		}
		let anim = spin.current;
		if (!on) {
			if (!anim || anim.playState === "finished" || anim.playState === "idle")
				return;
			const t = Number(anim.currentTime ?? 0);
			anim.effect?.updateTiming({ iterations: Math.floor(t / TURN_MS) + 1 });
			const a = anim;
			const io = new IntersectionObserver(([e]) => {
				if (e.isIntersecting) a.play();
				else a.pause();
			});
			io.observe(cover);
			return () => io.disconnect();
		}
		if (!anim || anim.playState === "finished" || anim.playState === "idle") {
			anim = group.animate(
				[{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
				{ duration: TURN_MS, iterations: Number.POSITIVE_INFINITY },
			);
			anim.pause();
			spin.current = anim;
		} else {
			anim.effect?.updateTiming({ iterations: Number.POSITIVE_INFINITY });
		}
		const a = anim;
		const bits = el.querySelectorAll<SVGPathElement>(".vg-bit");
		let lit = -1;
		let raf = 0;
		const light = (i: number, on: boolean) => {
			const glyph = el.querySelector(
				`.vg-glyphs[data-read] i:nth-child(${i + 1})`,
			);
			for (const n of [bits[i], glyph]) {
				if (!n) continue;
				if (on) n.setAttribute(LIT, "");
				else n.removeAttribute(LIT);
			}
		};
		const tick = () => {
			const t = Number(a.currentTime ?? 0);
			const deg = ((t % TURN_MS) / TURN_MS) * 360;
			const u = ((((deg + 90 + RING.start) % 360) + 360) % 360) / RING.step;
			const i = Math.floor(u);
			const next = i < RING.bits.length ? i : -1;
			if (next !== lit) {
				if (lit >= 0) light(lit, false);
				if (next >= 0) light(next, true);
				lit = next;
			}
			raf = requestAnimationFrame(tick);
		};
		const stop = () => {
			cancelAnimationFrame(raf);
			raf = 0;
		};
		const io = new IntersectionObserver(([e]) => {
			if (e.isIntersecting) {
				a.play();
				if (!raf) raf = requestAnimationFrame(tick);
			} else {
				a.pause();
				stop();
			}
		});
		io.observe(cover);
		return () => {
			io.disconnect();
			stop();
			if (lit >= 0) light(lit, false);
		};
	}, [root, on]);
}

function useLanding(
	shown: Diagram,
	bar: RefObject<HTMLDivElement | null>,
	body: RefObject<HTMLDivElement | null>,
	sentinel: RefObject<HTMLDivElement | null>,
) {
	const last = useRef(shown);
	useLayoutEffect(() => {
		if (last.current === shown) return;
		last.current = shown;
		const b = body.current;
		const t = bar.current;
		const s = sentinel.current;
		if (!b || !t || !s) return;
		const css = getComputedStyle(t);
		const top = b.getBoundingClientRect().top;
		if (css.position === "sticky") {
			const edge = t.getBoundingClientRect().bottom;
			if (top >= edge) return;
			const pin = Number.parseFloat(css.top) || 0;
			window.scrollBy({
				top: s.getBoundingClientRect().top - pin + 1,
				behavior: "instant",
			});
			return;
		}
		const nav = Number.parseFloat(css.getPropertyValue("--vg-nav")) || 0;
		if (top >= nav) return;
		const stage = t.closest(".vg-record")?.querySelector(".vg-record__stage");
		const land = stage
			? Number.parseFloat(getComputedStyle(stage).top) || nav
			: nav;
		window.scrollBy({
			top: s.getBoundingClientRect().top - land,
			behavior: "instant",
		});
	}, [shown, bar, body, sentinel]);
}

function FlipIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M8 1.5v1.6M8 5.9v1.6M8 10.3v1.6M8 13.1v1.4" />
			<path d="M5.6 3.6 1.5 12.4h4.1z" fill="currentColor" />
			<path d="M10.4 3.6l4.1 8.8h-4.1z" />
		</svg>
	);
}

function Glyphs({ bits, read }: { bits: string; read?: boolean }) {
	return (
		<span
			className="vg-glyphs"
			role="img"
			aria-label={`binary ${bits}`}
			data-read={read ? "" : undefined}
			style={{ "--n": bits.length } as CSSProperties}
		>
			{[...bits].map((b, i) => (
				<i key={`${i}${b}`} data-b={b} />
			))}
		</span>
	);
}

function Steps({ children }: { children: ReactNode[] }) {
	return (
		<ol className="vg-steps">
			{children.map((c, i) => (
				<li key={`s${i}`}>{c}</li>
			))}
		</ol>
	);
}

const ns = (HYDROGEN_S * 1e9).toFixed(3);

function Train({ t }: { t: number }) {
	const n = Math.floor(1 / t);
	return (
		<svg
			className="vg-train"
			viewBox="0 0 300 28"
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path className="vg-train__axis" d="M0 27.5 H300" />
			{Array.from({ length: n + 1 }, (_, i) => {
				const x = Math.min(299.5, Math.round(i * t * 300 * 10) / 10 + 0.5);
				return <path key={`p${x}`} d={`M${x} 2 V24`} />;
			})}
		</svg>
	);
}

function Panel({
	active,
	picked,
	pick,
	still,
}: {
	active: Diagram;
	picked: string;
	pick: (id: string) => void;
	still: boolean;
}) {
	if (active === "speed") {
		const s = seconds(rotation);
		return (
			<Steps>
				{[
					<>
						Read the marks around the record. A tick is 1, a dash is 0.
						<Glyphs bits={full(rotation)} read={!still} />
					</>,
					<>
						That is <b>{grouped(ticks(rotation))}</b> in binary.
					</>,
					<>
						Count it in hydrogen’s tick, {ns} billionths of a second:{" "}
						<b>
							{s.toFixed(2)}
							{"\u00a0"}s
						</b>{" "}
						for one turn.
					</>,
					<>
						60 ÷ {s.toFixed(1)} = <b>16⅔</b> turns a minute.
						{still
							? null
							: " The drawing turns at that speed now, and each mark lights as it passes the top."}
					</>,
				]}
			</Steps>
		);
	}
	if (active === "length") {
		const s = seconds(side);
		return (
			<Steps>
				{[
					<>
						Under the side view, the same code again, 43 marks long.
						<Glyphs bits={full(side)} />
					</>,
					<>
						<b>{grouped(ticks(side))}</b> hydrogen ticks.
					</>,
					<>
						That is{" "}
						<b>
							{(s / 60).toFixed(1)}
							{"\u00a0"}minutes
						</b>
						, the playing time of one side. The stylus in the drawing starts at
						the outside edge.
					</>,
				]}
			</Steps>
		);
	}
	if (active === "picture") {
		return (
			<>
				<Steps>
					{[
						<>
							Each picture starts with a burst, then its lines one after
							another, numbered 1, 2 and 3 in binary above the trace.
						</>,
						<>
							The marks below give the length of one line:{" "}
							<b>
								{(seconds(line) * 1000).toFixed(2)}
								{"\u00a0"}ms
							</b>
							.
							<Glyphs bits={full(line)} />
						</>,
						<>
							Lines run top to bottom and stack side by side, <b>{LINES}</b> to
							a picture. The first is a circle, so a finder can check the
							proportions.
						</>,
					]}
				</Steps>
				<PictureSound />
			</>
		);
	}
	if (active === "pulsars") {
		const p = pulsars.find((x) => x.id === picked) ?? pulsars[0];
		const t = period(p);
		return (
			<>
				<Steps>
					{[
						<>
							The Sun is where the lines meet. The long line points to the
							center of the galaxy, the other fourteen to pulsars, with their
							distance as the length.
						</>,
						<>
							The marks along each line give that pulsar’s period in hydrogen
							ticks. Pick one:
						</>,
					]}
				</Steps>
				<fieldset className="vg-pulsars" aria-label="Pulsars">
					{pulsars.map((x) => (
						<button
							key={x.id}
							type="button"
							aria-pressed={x.id === p.id}
							aria-label={`PSR ${x.name}`}
							onClick={() => pick(x.id)}
						>
							{x.id}
						</button>
					))}
				</fieldset>
				<div className="vg-pulsar-card">
					<p className="vg-pulsar-card__name">
						PSR {p.name}
						{p.nickname ? (
							<span className="vg-dim"> · the {p.nickname} pulsar</span>
						) : null}
					</p>
					<Glyphs bits={p.bits} />
					<p className="vg-pulsar-card__sum">
						<b>{grouped(Number.parseInt(p.bits, 2))}</b> ticks × {ns}
						{"\u00a0"}ns ={" "}
						<b>
							{t < 0.1
								? `${(t * 1000).toFixed(2)}\u00a0ms`
								: `${t.toFixed(4)}\u00a0s`}
						</b>{" "}
						per flash
					</p>
					<Train t={t} />
					<p className="vg-pulsar-card__axis">
						<span>0</span>
						<span>One second of its flashes, to scale</span>
						<span>1{"\u00a0"}s</span>
					</p>
				</div>
				<p className="vg-fine">
					Pulsars slow down at known rates, so the periods also date the map.
					Read back, they point to about 1970, when they were measured.
				</p>
			</>
		);
	}
	return (
		<Steps>
			{[
				<>
					Two hydrogen atoms, the electron’s spin flipped between them. The flip
					gives off radio at 1,420,405,752{"\u00a0"}Hz.
				</>,
				<>
					One wave of it lasts <b>{ns} billionths of a second</b> and is{" "}
					<b>21{"\u00a0"}cm</b> long. Every number on the cover counts in that
					tick.
				</>,
				<>
					The cover also carries a 2{"\u00a0"}cm patch of pure uranium‑238. Half
					of it decays every 4.5 billion years, so what is left tells a finder
					how long ago the record left Earth.
				</>,
			]}
		</Steps>
	);
}

export function Record() {
	const root = useRef<HTMLDivElement>(null);
	const sentinel = useRef<HTMLDivElement>(null);
	const bar = useRef<HTMLDivElement>(null);
	const body = useRef<HTMLDivElement>(null);
	const tabs = useRef<(HTMLButtonElement | null)[]>([]);
	const [active, setActive] = useState<Diagram>("speed");
	const [picked, setPicked] = useState(pulsars[6].id);
	const [flipped, setFlipped] = useState(false);
	const still = useStill();
	const [shown, out] = useSwap(active, still);
	const stuck = useStuck(sentinel);
	useLanding(shown, bar, body, sentinel);
	useReader(root, active === "speed" && !flipped && !still);

	const index = spots.findIndex((s) => s.id === active);
	const choose = (id: Diagram) => {
		setActive(id);
		setFlipped(false);
	};
	const flip = () => setFlipped((f) => !f);

	const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
		const last = spots.length - 1;
		const next =
			e.key === "ArrowRight"
				? index === last
					? 0
					: index + 1
				: e.key === "ArrowLeft"
					? index === 0
						? last
						: index - 1
					: e.key === "Home"
						? 0
						: e.key === "End"
							? last
							: -1;
		if (next < 0) return;
		e.preventDefault();
		choose(spots[next].id);
		tabs.current[next]?.focus({ preventScroll: true });
	};

	const onMap = (e: MouseEvent<HTMLButtonElement>) => {
		setActive("pulsars");
		const box = e.currentTarget.parentElement?.getBoundingClientRect();
		if (!box) return;
		const x = ((e.clientX - box.left) / box.width) * 1000 - MAP.x;
		const y = ((e.clientY - box.top) / box.height) * 1000 - MAP.y;
		if (Math.hypot(x, y) < 20) return;
		const a = (Math.atan2(y, x) * 180) / Math.PI;
		let best = pulsars[0];
		let gap = 999;
		for (const p of pulsars) {
			const d = Math.abs(((p.angle - a + 540) % 360) - 180);
			if (d < gap) {
				gap = d;
				best = p;
			}
		}
		if (gap < 12) setPicked(best.id);
	};

	return (
		<div className="vg-record vg-grid" ref={root}>
			<div className="vg-record__col">
				<div className="vg-record__stage">
					<div className="vg-record__disc">
						<div
							className="vg-flipper"
							data-flipped={flipped ? "true" : undefined}
						>
							<div className="vg-flipper__face" inert={flipped}>
								<Cover
									active={active}
									picked={active === "pulsars" ? picked : null}
								/>
								{spots.map((s) => (
									<button
										key={s.id}
										type="button"
										className="vg-spot"
										data-spot={s.id}
										aria-pressed={active === s.id}
										aria-label={s.label}
										style={{
											left: `${s.box[0] / 10}%`,
											top: `${s.box[1] / 10}%`,
											width: `${(s.box[2] - s.box[0]) / 10}%`,
											height: `${(s.box[3] - s.box[1]) / 10}%`,
										}}
										onClick={s.id === "pulsars" ? onMap : () => setActive(s.id)}
									/>
								))}
							</div>
							<div className="vg-flipper__back" inert={!flipped}>
								<Disc />
							</div>
						</div>
						<button
							type="button"
							className="vg-icon-button vg-record__corner"
							aria-label="Turn the record over"
							aria-pressed={flipped}
							onClick={flip}
						>
							<FlipIcon />
						</button>
					</div>
					<div className="vg-record__under">
						<button
							type="button"
							className="vg-button vg-record__flip"
							onClick={flip}
						>
							<FlipIcon />
							<span className="vg-record__swap" data-on={flipped ? "1" : "0"}>
								<span>Turn it over</span>
								<span>Show the cover</span>
							</span>
						</button>
						<p
							className="vg-record__hint vg-record__swap"
							data-on={flipped ? "1" : "0"}
						>
							<span>Pick a drawing to read it</span>
							<span>The record under the cover</span>
						</p>
					</div>
				</div>
			</div>
			<div className="vg-decode">
				<div className="vg-decode__sentinel" ref={sentinel} />
				<div
					className="vg-decode__bar"
					ref={bar}
					data-stuck={stuck ? "" : undefined}
				>
					<div
						className="vg-seg vg-decode__tabs"
						role="tablist"
						aria-label="Drawings on the cover"
						style={{ "--n": spots.length, "--i": index } as CSSProperties}
						onKeyDown={onKey}
					>
						{spots.map((s, i) => (
							<button
								key={s.id}
								ref={(b) => {
									tabs.current[i] = b;
								}}
								id={`vg-tab-${s.id}`}
								type="button"
								className="vg-seg__item"
								role="tab"
								aria-selected={active === s.id}
								aria-controls="vg-decode-panel"
								tabIndex={active === s.id ? 0 : -1}
								onClick={() => choose(s.id)}
							>
								{s.tab}
							</button>
						))}
					</div>
				</div>
				<div
					id="vg-decode-panel"
					ref={body}
					className="vg-decode__body"
					role="tabpanel"
					aria-labelledby={`vg-tab-${shown}`}
					data-out={out ? "" : undefined}
				>
					<h3 className="vg-decode__title">
						{titles[shown]}
						<span className="vg-stop">.</span>
					</h3>
					<Panel
						active={shown}
						picked={picked}
						pick={setPicked}
						still={still}
					/>
				</div>
			</div>
			<ul className="vg-tilerow vg-record__contents" data-reveal="">
				{contents.map((c) => (
					<li key={c.label} className="vg-tile">
						<p className="vg-tile__label">{c.label}</p>
						<p className="vg-tile__value">
							{c.value}
							{c.unit ? <span className="vg-unit"> {c.unit}</span> : null}
						</p>
						<p className="vg-tile__note">{c.note}</p>
					</li>
				))}
			</ul>
		</div>
	);
}
