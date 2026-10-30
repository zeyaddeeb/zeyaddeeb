"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import {
	type PointerEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	draw,
	measure,
	type Palette,
	paintGrid,
	readPalette,
	type View,
} from "./draw";
import {
	create,
	type Event,
	type Game,
	LIVES,
	pull,
	resize,
	type Snapshot,
	snapshot,
	start,
	step,
} from "./game";
import { impressionOf, pages, sheet } from "./pages";
import { SortIcon } from "./sort-icon";
import { kinds, names } from "./sorts";
import "./sorts.css";

const BEST = "out-of-sorts:best";
const TAP = 280;
const SLOP = 8;
const GAIN = 1.4;
const LEAVE = 240;
const SETTLE = 0.6;

interface Drag {
	id: number;
	x: number;
	gx: number;
	at: number;
	moved: boolean;
}

const pad = (value: number) => String(value).padStart(4, "0");

const seed = () => Math.floor(Math.random() * 2 ** 31);

const still = () =>
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function remembered() {
	try {
		return Number(window.localStorage.getItem(BEST)) || 0;
	} catch {
		return 0;
	}
}

function remember(score: number) {
	try {
		window.localStorage.setItem(BEST, String(score));
	} catch {}
}

function told(events: Event[], hud: Snapshot) {
	if (events.includes("over")) return `Out of sorts. ${hud.score} points.`;

	if (events.includes("page")) return `Page ${sheet(hud.run + 1).page} next.`;

	if (events.includes("hit"))
		return hud.lives === 1
			? "Hit. One dot left."
			: `Hit. ${hud.lives} dots left.`;

	return null;
}

export default function Invaders({ onClose }: { onClose: () => void }) {
	const rootRef = useRef<HTMLDivElement>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const gameRef = useRef<Game | null>(null);
	const viewRef = useRef<View | null>(null);
	const paletteRef = useRef<Palette | null>(null);
	const keys = useRef({ left: false, right: false });
	const target = useRef<number | null>(null);
	const drag = useRef<Drag | null>(null);
	const pausedRef = useRef(false);
	const overAt = useRef(0);
	const [hud, setHud] = useState<Snapshot>(() => snapshot(create(1)));
	const [best, setBest] = useState(0);
	const [paused, setPaused] = useState(false);
	const [shown, setShown] = useState(false);
	const [leaving, setLeaving] = useState(false);
	const [news, setNews] = useState("");

	const hold = useCallback((value: boolean) => {
		pausedRef.current = value;
		setPaused(value);
	}, []);

	const publish = useCallback((game: Game, events: Event[] = []) => {
		const next = snapshot(game);

		setHud(next);

		const line = told(events, next);

		if (line) setNews(line);

		if (events.includes("over")) {
			overAt.current = performance.now();

			setBest((value) => {
				if (next.score <= value) return value;

				remember(next.score);

				return next.score;
			});
		}
	}, []);

	const leave = useCallback(() => {
		setLeaving(true);
		window.setTimeout(onClose, LEAVE);
	}, [onClose]);

	const again = useCallback(() => {
		const view = viewRef.current;
		const game = create(seed(), view?.cols, still());

		start(game);
		gameRef.current = game;
		hold(false);
		publish(game);
		rootRef.current?.focus();
	}, [hold, publish]);

	const shoot = useCallback(() => {
		const game = gameRef.current;

		if (!game) return;

		if (pausedRef.current) {
			hold(false);

			return;
		}

		if (game.phase === "over") {
			if (performance.now() - overAt.current > SETTLE * 1000) again();

			return;
		}

		if (game.phase === "idle") {
			start(game);
			publish(game);
			rootRef.current?.focus();
		}

		pull(game);
	}, [again, hold, publish]);

	useEffect(() => {
		const html = document.documentElement;
		const overflow = html.style.overflow;
		const id = requestAnimationFrame(() => setShown(true));

		html.style.overflow = "hidden";
		setBest(remembered());
		rootRef.current?.focus();

		return () => {
			cancelAnimationFrame(id);
			html.style.overflow = overflow;
		};
	}, []);

	useEffect(() => {
		const stage = stageRef.current;
		const canvas = canvasRef.current;

		if (!stage || !canvas) return;

		const fit = () => {
			const rect = stage.getBoundingClientRect();

			if (!rect.width || !rect.height) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const palette = paletteRef.current ?? readPalette(stage);
			const view = measure(rect.width, rect.height, dpr);

			paletteRef.current = palette;
			canvas.width = Math.round(rect.width * dpr);
			canvas.height = Math.round(rect.height * dpr);
			view.grid = paintGrid(view, palette);
			viewRef.current = view;

			const game = gameRef.current;

			if (game) resize(game, view.cols);
			else {
				gameRef.current = create(seed(), view.cols, still());
				publish(gameRef.current);
			}
		};

		const observer = new ResizeObserver(fit);

		fit();
		observer.observe(stage);

		return () => observer.disconnect();
	}, [publish]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		let raf = 0;
		let last = performance.now();

		const frame = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			const game = gameRef.current;
			const view = viewRef.current;
			const palette = paletteRef.current;

			last = now;

			if (ctx && game && view && palette) {
				if (!pausedRef.current) {
					const { left, right } = keys.current;
					const move = (right ? 1 : 0) - (left ? 1 : 0);
					const phase = game.phase;
					const events = step(
						game,
						{ move, target: move ? null : target.current },
						dt,
					);

					if (events.length || game.phase !== phase) publish(game, events);
				}

				draw(ctx, game, view, palette);
			}

			raf = requestAnimationFrame(frame);
		};

		raf = requestAnimationFrame(frame);

		return () => cancelAnimationFrame(raf);
	}, [publish]);

	useEffect(() => {
		const side = (code: string) =>
			code === "ArrowLeft" || code === "KeyA"
				? "left"
				: code === "ArrowRight" || code === "KeyD"
					? "right"
					: null;

		const down = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey) return;

			if (event.code === "Escape") {
				event.preventDefault();
				leave();

				return;
			}

			const button = event.target instanceof HTMLButtonElement;
			const key = side(event.code);

			if (key) {
				event.preventDefault();
				keys.current[key] = true;
				target.current = null;

				return;
			}

			if (
				!button &&
				(event.code === "Space" ||
					event.code === "ArrowUp" ||
					event.code === "KeyW")
			) {
				event.preventDefault();

				if (!event.repeat) shoot();

				return;
			}

			if (event.code === "KeyP") {
				const phase = gameRef.current?.phase;

				if (phase === "play" || phase === "turn") hold(!pausedRef.current);
			}
		};

		const up = (event: KeyboardEvent) => {
			const key = side(event.code);

			if (key) keys.current[key] = false;
		};

		const away = () => {
			const phase = gameRef.current?.phase;

			if (document.visibilityState === "hidden" && phase === "play") hold(true);
		};

		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		document.addEventListener("visibilitychange", away);

		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
			document.removeEventListener("visibilitychange", away);
		};
	}, [hold, leave, shoot]);

	const press = (event: PointerEvent<HTMLDivElement>) => {
		const game = gameRef.current;

		if (!game) return;

		if (event.pointerType === "mouse") {
			if (event.button === 0) shoot();

			return;
		}

		if (drag.current) {
			shoot();

			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = {
			id: event.pointerId,
			x: event.clientX,
			gx: game.x,
			at: performance.now(),
			moved: false,
		};
	};

	const slide = (event: PointerEvent<HTMLDivElement>) => {
		const view = viewRef.current;

		if (!view) return;

		if (event.pointerType === "mouse") {
			const rect = event.currentTarget.getBoundingClientRect();

			target.current = (event.clientX - rect.left - view.ox) / view.cell - 0.5;

			return;
		}

		const current = drag.current;

		if (!current || current.id !== event.pointerId) return;

		const dx = event.clientX - current.x;

		if (Math.abs(dx) > SLOP) current.moved = true;

		if (current.moved) target.current = current.gx + (dx / view.cell) * GAIN;
	};

	const lift = (event: PointerEvent<HTMLDivElement>) => {
		const current = drag.current;

		if (!current || current.id !== event.pointerId) return;

		drag.current = null;
		target.current = null;

		if (!current.moved && performance.now() - current.at < TAP) shoot();
	};

	const drop = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "mouse") target.current = null;
	};

	const playing = hud.phase === "play" || hud.phase === "turn";
	const total = pages.length;
	const coming = sheet(hud.run + 1);

	return (
		<div
			ref={rootRef}
			className="os"
			role="dialog"
			aria-modal="true"
			aria-label="Out of Sorts"
			tabIndex={-1}
			data-shown={(shown && !leaving) || undefined}
		>
			<header className="os__bar">
				<p className="os__title">
					Out of Sorts<span className="os__stop">.</span>
				</p>
				<dl className="os__stats">
					<div className="os__stat">
						<dt className="os__label">Score</dt>
						<dd className="os__value">{pad(hud.score)}</dd>
					</div>
					<div className="os__stat os__wide">
						<dt className="os__label">Best</dt>
						<dd className="os__value">{pad(Math.max(best, hud.score))}</dd>
					</div>
					<div className="os__stat">
						<dt className="os__label">Dots</dt>
						<dd className="os__value os__dots">
							{Array.from({ length: LIVES }, (_, i) => (
								<span
									key={i}
									className="os__dot"
									data-spent={i >= hud.lives || undefined}
								/>
							))}
						</dd>
					</div>
					<div className="os__stat">
						<dt className="os__label">Page</dt>
						<dd className="os__value">
							{hud.page}
							<span className="os__of">/{total}</span>
						</dd>
					</div>
				</dl>
				<div className="os__actions">
					<button
						type="button"
						className="os__button os__pause"
						disabled={!playing}
						onClick={() => hold(!paused)}
					>
						{paused ? "Resume" : "Pause"}
					</button>
					<button type="button" className="os__button" onClick={leave}>
						<span aria-hidden="true">
							<LifeArrow direction="left" seed="Back to the page" />
						</span>
						<span className="os__wide">Back to the page</span>
						<span className="os__narrow">Back</span>
					</button>
				</div>
			</header>

			<div
				ref={stageRef}
				className="os__stage"
				role="application"
				aria-label="Play area. Arrow keys move, Space fires."
				onPointerDown={press}
				onPointerMove={slide}
				onPointerUp={lift}
				onPointerCancel={lift}
				onPointerLeave={drop}
				onContextMenu={(event) => event.preventDefault()}
			>
				<canvas
					ref={canvasRef}
					className="os__canvas"
					role="img"
					aria-label="Lines of lowercase type built from rings, arches, stems and dots, coming down a page toward a small i on the bottom line."
				/>

				{hud.phase === "idle" && (
					<div className="os__card">
						<p className="os__label">A hidden page</p>
						<h2>
							The type came loose<span className="os__stop">.</span>
						</h2>
						<p>
							Knock sorts off the letters with your dot. Whatever you knock
							loose falls straight back down, so step out from under it.
						</p>
						<div className="os__row">
							<button
								type="button"
								className="os__button"
								data-strong
								onPointerDown={(event) => event.stopPropagation()}
								onClick={shoot}
							>
								Start
							</button>
							<span className="os__label os__hint--keys">or press Space</span>
						</div>
					</div>
				)}

				{hud.phase === "turn" && (
					<div className="os__card os__card--quiet" aria-hidden="true">
						<p className="os__label">
							{impressionOf(coming.impression)} impression
						</p>
						<h2>
							Page {coming.page}
							<span className="os__stop">.</span>
						</h2>
					</div>
				)}

				{paused && hud.phase !== "over" && (
					<div className="os__card">
						<h2>
							Paused<span className="os__stop">.</span>
						</h2>
						<div className="os__row">
							<button
								type="button"
								className="os__button"
								data-strong
								onPointerDown={(event) => event.stopPropagation()}
								onClick={() => hold(false)}
							>
								Resume
							</button>
						</div>
					</div>
				)}

				{hud.phase === "over" && (
					<div className="os__card">
						<p className="os__label">
							{hud.ending === "room"
								? "The type reached your line"
								: "All three dots are gone"}
						</p>
						<h2>
							Out of sorts<span className="os__stop">.</span>
						</h2>
						<p>
							{hud.score} points, page {hud.page} of the{" "}
							{impressionOf(hud.impression).toLowerCase()} impression.
							{hud.score > 0 && hud.score >= best ? " A new best." : ""}
						</p>
						<div className="os__row">
							<button
								type="button"
								className="os__button"
								data-strong
								onPointerDown={(event) => event.stopPropagation()}
								onClick={again}
							>
								Set it again
							</button>
							<button
								type="button"
								className="os__button"
								onPointerDown={(event) => event.stopPropagation()}
								onClick={leave}
							>
								Back to the page
							</button>
						</div>
					</div>
				)}
			</div>

			<footer className="os__foot">
				<p className="os__hint os__hint--keys">
					Arrow keys move. Space fires. P pauses. Esc goes back.
				</p>
				<p className="os__hint os__hint--touch">
					Drag sideways to move. Tap to fire.
				</p>
				<ul className="os__case" aria-label="Knocked loose">
					{kinds.map((kind) => (
						<li key={kind} className="os__count" title={names[kind]}>
							<SortIcon kind={kind} />
							<span>{hud.knocked[kind]}</span>
						</li>
					))}
				</ul>
			</footer>

			<p className="os__news" aria-live="polite">
				{news}
			</p>
		</div>
	);
}
