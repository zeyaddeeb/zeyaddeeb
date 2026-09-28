"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import {
	type CSSProperties,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { number } from "@/features/catalog/catalog";
import { usePresence } from "@/features/live/presence";
import {
	useReducedMotion,
	useShouldRun,
} from "@/lib/hooks/use-animation-activity";
import { useWasm } from "@/lib/hooks/use-wasm";
import { clamp } from "@/lib/math";
import {
	BASELINE,
	type Box,
	boxOf,
	COLS,
	encode,
	fold,
	forms,
	isInitial,
	kit,
	LAND,
	type Place,
	PORT,
	ROWS,
	resetCode,
	snap,
	toLand,
	toPort,
	turned,
	XHEIGHT,
} from "./bauspiel";
import { type Form, type Shape, type Spot, scenes, shapes } from "./scenes";
import "./poster.css";

const DWELL = 4200;
const DRAG_SLOP = 4;
const OP_LIMIT = 4000;
const STOPS = scenes.length + 1;

const depth: Record<Shape, number> = {
	block: 0.2,
	sun: 1,
	moon: -0.8,
	slab: 0.6,
	core: -0.5,
	line: 0.3,
	dot: 1.3,
};

const steps: Record<string, [number, number]> = {
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
};

interface Drag {
	index: number;
	pointer: number;
	offX: number;
	offY: number;
	col: number;
	row: number;
	startX: number;
	startY: number;
	moved: boolean;
	target: Place | null;
}

function vars(land: Form, port: Form, extra?: Record<string, string | number>) {
	return {
		"--lx": land.x,
		"--ly": land.y,
		"--lw": land.w,
		"--lh": land.h,
		"--lr": `${land.r ?? 0}deg`,
		"--px": port.x,
		"--py": port.y,
		"--pw": port.w,
		"--ph": port.h,
		"--pr": `${port.r ?? 0}deg`,
		...extra,
	} as CSSProperties;
}

function spot(land: Spot, port: Spot) {
	const side = (value: Spot, key: "l" | "p") => ({
		[`--${key}x`]: value.x,
		[`--${key}y`]: value.y,
		[`--${key}w`]: value.w,
		[`--${key}v`]: value.v ?? 0,
		[`--${key}r`]: `${value.r ?? 0}deg`,
		[`--${key}c`]: `var(--${value.tone})`,
		[`--${key}a`]: value.align ?? "left",
		[`--${key}s`]: `var(--${value.stop ?? "red"})`,
	});
	return { ...side(land, "l"), ...side(port, "p") } as CSSProperties;
}

function frame(box: Box) {
	const land = toLand(box);
	const port = toPort(box);
	return vars({ ...land, c: "ink" }, { ...port, c: "ink" });
}

function Grid({
	cols,
	rows,
	className,
}: {
	cols: number;
	rows: number;
	className: string;
}) {
	const arm = 0.07;
	let marks = "";
	let lines = "";
	for (let c = 0; c <= cols; c++) {
		lines += `M${c} 0V${rows}`;
		for (let r = 0; r <= rows; r++) {
			marks += `M${c - arm} ${r}h${arm * 2}M${c} ${r - arm}v${arm * 2}`;
		}
	}
	for (let r = 0; r <= rows; r++) lines += `M0 ${r}H${cols}`;
	const guides = `M0 ${XHEIGHT}H${cols}M0 ${BASELINE}H${cols}`;
	return (
		<svg
			className={className}
			viewBox={`0 0 ${cols} ${rows}`}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path className="poster__grid-lines" d={lines} />
			<path className="poster__grid-guides" d={guides} />
			<path className="poster__grid-marks" d={marks} />
		</svg>
	);
}

function tick() {
	try {
		navigator.vibrate?.(8);
	} catch {}
}

export function Poster({ head }: { head: ReactNode }) {
	const { peers, peer, cursors, sendCursor, status, text, sequence, insert } =
		usePresence();
	const { wasm, error } = useWasm();
	const worldRef = useRef<HTMLDivElement>(null);
	const boardRef = useRef<HTMLDivElement>(null);
	const shouldRun = useShouldRun(worldRef);
	const reduced = useReducedMotion();
	const [active, setActive] = useState(0);
	const [preview, setPreview] = useState<number | null>(null);
	const [playing, setPlaying] = useState(true);
	const [hovering, setHovering] = useState(false);
	const [local, setLocal] = useState("");
	const [selected, setSelected] = useState<number | null>(null);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [message, setMessage] = useState("");
	const dragRef = useRef<Drag | null>(null);
	const swipeRef = useRef<{ id: number; x: number; y: number } | null>(null);
	const suppress = useRef(false);
	const pointerKind = useRef("mouse");
	const updateDrag = (next: Drag | null) => {
		dragRef.current = next;
		setDrag(next);
	};

	const shared = !!wasm && !error;
	const log = shared ? text : local;
	const { layout, order } = useMemo(() => fold(log), [log]);
	const full = shared && sequence.length >= OP_LIMIT;
	const connected = status === "online" && peers !== null;
	const count = connected ? String(peers).padStart(2, "0") : "—";
	const shown = preview ?? active;
	const playMode = shown === 0;
	const scene = playMode ? null : scenes[shown - 1];
	const auto = playing && !reduced;
	const running = shouldRun && !hovering && !drag && preview === null;

	const spins = useRef(layout.map((place) => place.rot));
	const lastRot = useRef(layout.map((place) => place.rot));
	layout.forEach((place, index) => {
		const turned = (place.rot - (lastRot.current[index] ?? 0) + 4) % 4;
		spins.current[index] = (spins.current[index] ?? 0) + turned;
		lastRot.current[index] = place.rot;
	});

	useEffect(() => {
		if (!message) return;
		const id = setTimeout(() => setMessage(""), 3200);
		return () => clearTimeout(id);
	}, [message]);

	const stop = () => setPlaying(false);

	const go = (index: number) => {
		setActive(((index % STOPS) + STOPS) % STOPS);
		setSelected(null);
		stop();
	};

	const toBoard = (clientX: number, clientY: number) => {
		const board = boardRef.current;
		if (!board) return null;
		const rect = board.getBoundingClientRect();
		return {
			col: ((clientX - rect.left) / rect.width) * COLS,
			row: ((clientY - rect.top) / rect.height) * ROWS,
		};
	};

	const commit = (code: string) => {
		if (shared) insert(text.length, code);
		else setLocal((value) => value + code);
	};

	const place = (index: number, next: Place | null) => {
		const current = layout[index];
		if (!current || !next) return false;
		if (full) {
			setMessage("The shared poster is out of moves until the room empties.");
			return false;
		}
		if (next.cell === current.cell && next.rot === current.rot) return false;
		commit(encode(index, next));
		setMessage("");
		tick();
		return true;
	};

	const turn = (index: number) => {
		const current = layout[index];
		if (!current) return;
		place(index, turned(index, current));
	};

	const lift = (
		index: number,
		pointer: number,
		clientX: number,
		clientY: number,
	) => {
		const current = layout[index];
		const at = toBoard(clientX, clientY);
		if (!current || !at) return;
		const col = current.cell % COLS;
		const row = Math.floor(current.cell / COLS);
		updateDrag({
			index,
			pointer,
			offX: at.col - col,
			offY: at.row - row,
			col,
			row,
			startX: clientX,
			startY: clientY,
			moved: false,
			target: null,
		});
		stop();
	};

	const grab = (event: PointerEvent<HTMLButtonElement>, index: number) => {
		if (event.button !== 0 || !event.isPrimary || dragRef.current) return;
		pointerKind.current = event.pointerType;
		if (event.pointerType !== "mouse" && selected !== index) return;
		event.stopPropagation();
		suppress.current = false;
		swipeRef.current = null;
		event.currentTarget.setPointerCapture(event.pointerId);
		lift(index, event.pointerId, event.clientX, event.clientY);
	};

	const pull = (event: PointerEvent<HTMLButtonElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointer !== event.pointerId) return;
		const current = layout[drag.index];
		const at = toBoard(event.clientX, event.clientY);
		if (!current || !at) return;
		const moved =
			drag.moved ||
			Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >
				DRAG_SLOP;
		const col = at.col - drag.offX;
		const row = at.row - drag.offY;
		updateDrag({
			...drag,
			col,
			row,
			moved,
			target: snap(drag.index, col, row, current.rot),
		});
	};

	const drop = (event: PointerEvent<HTMLButtonElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointer !== event.pointerId) return;
		event.stopPropagation();
		if (drag.moved) {
			suppress.current = true;
			if (drag.target) place(drag.index, drag.target);
			setSelected(drag.index);
		}
		updateDrag(null);
	};

	const cancelDrag = (event: PointerEvent<HTMLButtonElement>) => {
		if (dragRef.current?.pointer !== event.pointerId) return;
		suppress.current = true;
		updateDrag(null);
	};

	const press = (index: number) => {
		if (suppress.current) {
			suppress.current = false;
			return;
		}
		stop();
		if (selected === index && kit[index]?.turns) turn(index);
		else setSelected(index);
	};

	const nudge = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		const current = layout[index];
		if (!current) return;
		if (event.key === "r" || event.key === "R") {
			event.preventDefault();
			setSelected(index);
			turn(index);
			return;
		}
		const step = steps[event.key];
		if (!step) return;
		event.preventDefault();
		stop();
		setSelected(index);
		const col = (current.cell % COLS) + step[0];
		const row = Math.floor(current.cell / COLS) + step[1];
		const next = snap(index, col, row, current.rot);
		if (!place(index, next)) setMessage("That’s the edge of the poster.");
	};

	const tap = (event: PointerEvent<HTMLDivElement>) => {
		if (selected === null) return;
		const current = layout[selected];
		const at = toBoard(event.clientX, event.clientY);
		if (!current || !at) return;
		const box = boxOf(selected, 0, 0, current.rot);
		const { col, row } = at;
		place(
			selected,
			snap(
				selected,
				Math.floor(col) - Math.floor((box.w - 1) / 2),
				Math.floor(row) - Math.floor((box.h - 1) / 2),
				current.rot,
			),
		);
	};

	const point = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== "mouse") return;
		const world = event.currentTarget;
		const rect = world.getBoundingClientRect();
		const mx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
		const my = ((event.clientY - rect.top) / rect.height) * 2 - 1;
		world.style.setProperty("--mx", mx.toFixed(3));
		world.style.setProperty("--my", my.toFixed(3));
		const at = toBoard(event.clientX, event.clientY);
		if (!at) return;
		const { col, row } = at;
		sendCursor(clamp(col / COLS, 0, 1), clamp(row / ROWS, 0, 1));
	};

	const settle = (event: PointerEvent<HTMLDivElement>) => {
		event.currentTarget.style.setProperty("--mx", "0");
		event.currentTarget.style.setProperty("--my", "0");
	};

	const swipeStart = (event: PointerEvent<HTMLDivElement>) => {
		pointerKind.current = event.pointerType;
		if (event.pointerType === "mouse") return;
		swipeRef.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
		};
	};

	const swipeEnd = (event: PointerEvent<HTMLDivElement>) => {
		const start = swipeRef.current;
		swipeRef.current = null;
		if (!start || start.id !== event.pointerId || dragRef.current) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
		suppress.current = true;
		go(active + (dx < 0 ? 1 : -1));
		window.setTimeout(() => {
			suppress.current = false;
		}, 0);
	};

	const pieceForms = (index: number) => {
		const current = layout[index];
		if (!current) return null;
		const dragging = drag?.index === index && drag.moved;
		const col = dragging && drag ? drag.col : current.cell % COLS;
		const row = dragging && drag ? drag.row : Math.floor(current.cell / COLS);
		return forms(
			index,
			boxOf(index, col, row, current.rot),
			spins.current[index] ?? 0,
		);
	};

	const titleOf = (i: number) =>
		i === 0 ? "Bauspiel" : (scenes[i - 1]?.experiment.title ?? "");

	const progress = (i: number) =>
		auto && preview === null && i === active ? (
			<span
				key={`${active}-${i}`}
				className="poster__progress"
				aria-hidden="true"
				style={{
					animationDuration: `${DWELL}ms`,
					animationPlayState: running ? "running" : "paused",
				}}
				onAnimationEnd={() => setActive((value) => (value + 1) % STOPS)}
			/>
		) : null;

	const hint =
		message ||
		(full
			? "Out of moves until the room empties."
			: "Shared live with everyone here. Drag to move, tap twice to turn.");
	const touchHint =
		message ||
		(full
			? "Out of moves until the room empties."
			: "Shared live with everyone here. Tap a shape, then drag it. Tap again to turn it.");

	return (
		<section
			className="poster"
			aria-label="Side projects and notes"
			data-mode={playMode ? "play" : "show"}
			data-blend={playMode || scene?.blend || undefined}
			data-caret={scene?.caret || undefined}
			data-dragging={drag?.moved || undefined}
		>
			<div className="poster__stage">
				<div
					className="poster__world"
					ref={worldRef}
					style={
						{
							"--bx": PORT.x,
							"--by": PORT.y,
							"--bc": PORT.cell,
							"--cols": COLS,
							"--rows": ROWS,
						} as CSSProperties
					}
					onPointerMove={point}
					onPointerLeave={settle}
					onPointerDown={swipeStart}
					onPointerUp={swipeEnd}
					onPointerCancel={() => {
						swipeRef.current = null;
					}}
				>
					<div
						ref={boardRef}
						className="poster__board"
						aria-hidden="true"
						onPointerUp={tap}
						style={frame({ col: 0, row: 0, w: COLS, h: ROWS })}
					>
						<Grid cols={COLS} rows={ROWS} className="poster__grid" />
					</div>
					{kit.map((piece, index) => {
						const shape = shapes.find((item) => item === piece.id);
						const staged = !playMode && scene && shape;
						const set = staged
							? { land: scene.land[shape], port: scene.port[shape] }
							: pieceForms(index);
						if (!set) return null;
						const rank = playMode ? order.indexOf(index) : index;
						const dragging = playMode && drag?.index === index && drag.moved;
						return (
							<span
								key={piece.id}
								className="poster__shape"
								data-k={set.land.k ?? "rect"}
								data-shape={piece.id}
								data-away={(!playMode && !shape) || undefined}
								data-dragging={dragging || undefined}
								data-live={
									shape === "dot" && playMode && connected ? true : undefined
								}
								aria-hidden="true"
								style={vars(set.land, set.port, {
									"--c": `var(--${set.land.c})`,
									"--q": `var(--${set.land.q ?? "paper"})`,
									"--d": shape ? depth[shape] : 0.4,
									zIndex: dragging ? 30 : rank + 1,
								})}
							>
								{set.land.p && (
									<span
										key={set.land.p}
										className="poster__skin"
										data-p={set.land.p}
									/>
								)}
								{shape === "dot" && (
									<span key={count} className="poster__count">
										{count}
									</span>
								)}
							</span>
						);
					})}
					{scenes.map((item, si) => {
						const current = !playMode && shown === si + 1;
						const { land, port } = item.labels;
						return (
							<div
								key={item.experiment.id}
								className="poster__labels"
								data-current={current || undefined}
								aria-hidden={!current}
							>
								<div
									className="poster__label"
									style={spot(land.title, port.title)}
								>
									<span className="poster__label-eyebrow">
										Experiment / {number(item.experiment.number)}
									</span>
									<Link
										href={item.experiment.href}
										className="poster__label-title"
										tabIndex={current ? undefined : -1}
									>
										{item.experiment.title}
										<span className="poster__label-stop">.</span>
										<span className="poster__label-arrow" aria-hidden="true">
											<LifeArrow
												direction={
													item.experiment.external ? "up-right" : "right"
												}
												active={current}
											/>
										</span>
									</Link>
								</div>
								<p
									className="poster__label poster__label--line"
									style={spot(land.line, port.line)}
								>
									{item.experiment.line}
								</p>
							</div>
						);
					})}
					{playMode && drag?.moved && drag.target && (
						<span
							className="poster__ghost"
							aria-hidden="true"
							style={frame(
								boxOf(
									drag.index,
									drag.target.cell % COLS,
									Math.floor(drag.target.cell / COLS),
									drag.target.rot,
								),
							)}
						/>
					)}
					{playMode &&
						kit.map((piece, index) => {
							const current = layout[index];
							if (!current) return null;
							const dragging = drag?.index === index && drag.moved;
							const col = dragging && drag ? drag.col : current.cell % COLS;
							const row =
								dragging && drag ? drag.row : Math.floor(current.cell / COLS);
							const style = frame(boxOf(index, col, row, current.rot));
							return (
								<button
									key={piece.id}
									type="button"
									className="poster__handle"
									data-selected={selected === index || undefined}
									data-dragging={dragging || undefined}
									aria-pressed={selected === index}
									aria-label={`${piece.label}. Arrow keys move it${piece.turns ? ", R turns it" : ""}.`}
									style={{
										...style,
										zIndex: dragging ? 40 : 20 + order.indexOf(index),
									}}
									onPointerEnter={(event) => {
										if (event.pointerType === "mouse") setHovering(true);
									}}
									onPointerLeave={() => setHovering(false)}
									onPointerDown={(event) => grab(event, index)}
									onPointerMove={pull}
									onPointerUp={drop}
									onPointerCancel={cancelDrag}
									onLostPointerCapture={cancelDrag}
									onContextMenu={(event) => event.preventDefault()}
									onClick={() => press(index)}
									onKeyDown={(event) => nudge(event, index)}
								/>
							);
						})}
					{connected &&
						cursors
							.filter((cursor) => cursor.peer !== peer)
							.map((cursor) => {
								const col = cursor.x * COLS;
								const row = cursor.y * ROWS;
								return (
									<span
										key={cursor.peer}
										className="poster__visitor"
										aria-hidden="true"
										style={
											{
												"--lx": LAND.x + col * LAND.cell,
												"--ly": LAND.y + row * LAND.cell,
												"--px": PORT.x + col * PORT.cell,
												"--py": PORT.y + row * PORT.cell,
											} as CSSProperties
										}
									/>
								);
							})}

					<div className="poster__note" aria-live="polite">
						<span>{hint}</span>
						<button
							type="button"
							disabled={isInitial(layout) || full}
							onClick={() => {
								commit(resetCode);
								setSelected(null);
							}}
						>
							Reset
						</button>
					</div>
				</div>
			</div>
			<div className="poster__head">{head}</div>

			<nav
				className="poster__contents"
				aria-label="Featured"
				onPointerLeave={() => setPreview(null)}
			>
				<div className="poster__contents-head">
					<span>Featured</span>
					{!reduced && (
						<button
							type="button"
							className="poster__pause"
							onClick={() => setPlaying((value) => !value)}
						>
							{playing ? "Pause" : "Play"}
						</button>
					)}
				</div>
				<ol>
					{Array.from({ length: STOPS }, (_, i) => {
						const item = scenes[i - 1];
						const inner = (
							<>
								<span className="poster__row-n">
									{item ? (
										number(item.experiment.number)
									) : (
										<span
											className="poster__live"
											data-live={connected || undefined}
										>
											{count}
										</span>
									)}
								</span>
								<span className="poster__row-title">{titleOf(i)}</span>
								<span className="poster__row-arrow" aria-hidden="true">
									{item && (
										<LifeArrow
											direction={
												item.experiment.external ? "up-right" : "right"
											}
										/>
									)}
								</span>
								{progress(i)}
							</>
						);
						const common = {
							className: "poster__row",
							"data-current": shown === i || undefined,
							onPointerDown: (event: PointerEvent) => {
								pointerKind.current = event.pointerType;
							},
							onPointerEnter: (event: PointerEvent) => {
								if (event.pointerType === "mouse") setPreview(i);
							},
							onFocus: () => setPreview(i),
							onBlur: () => setPreview(null),
						};
						return (
							<li key={item?.experiment.id ?? "bauspiel"}>
								{item ? (
									<Link
										{...common}
										href={item.experiment.href}
										onClick={(event) => {
											if (pointerKind.current !== "mouse" && shown !== i) {
												event.preventDefault();
												go(i);
											}
										}}
									>
										{inner}
									</Link>
								) : (
									<button {...common} type="button" onClick={() => go(0)}>
										{inner}
									</button>
								)}
							</li>
						);
					})}
				</ol>
			</nav>

			<div className="poster__dock">
				<div className="poster__captions">
					{Array.from({ length: STOPS }, (_, i) => {
						const item = scenes[i - 1];
						return (
							<div
								key={item?.experiment.id ?? "bauspiel"}
								className="poster__caption"
								data-current={shown === i || undefined}
								aria-hidden={shown !== i}
							>
								{item ? (
									<Link
										href={item.experiment.href}
										className="poster__caption-title"
										tabIndex={shown === i ? undefined : -1}
									>
										<span>{item.experiment.title}</span>
										<span aria-hidden="true">
											<LifeArrow
												direction={
													item.experiment.external ? "up-right" : "right"
												}
											/>
										</span>
									</Link>
								) : (
									<p className="poster__caption-title">
										<span>Bauspiel</span>
										<span
											className="poster__live"
											data-live={connected || undefined}
										>
											{count}
										</span>
									</p>
								)}
								<p className="poster__caption-line">
									{item ? item.experiment.line : touchHint}
								</p>
							</div>
						);
					})}
				</div>
				<div className="poster__strip">
					{Array.from({ length: STOPS }, (_, i) => (
						<button
							key={scenes[i - 1]?.experiment.id ?? "bauspiel"}
							type="button"
							className="poster__stop"
							aria-current={shown === i || undefined}
							aria-label={titleOf(i)}
							onClick={() => go(i)}
						>
							{i === 0 ? (
								<span
									className="poster__live"
									data-live={connected || undefined}
								>
									{count}
								</span>
							) : (
								number(scenes[i - 1]?.experiment.number ?? 0)
							)}
							{progress(i)}
						</button>
					))}
					{!reduced && (
						<button
							type="button"
							className="poster__toggle"
							data-playing={playing || undefined}
							aria-label={playing ? "Pause" : "Play"}
							onClick={() => setPlaying((value) => !value)}
						>
							<span aria-hidden="true" />
						</button>
					)}
				</div>
			</div>
		</section>
	);
}
