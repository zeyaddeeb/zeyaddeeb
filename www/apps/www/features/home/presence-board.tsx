"use client";

import { BLOG_URL, LifeArrow } from "@zeyaddeeb/ui";
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
import { experiments, number } from "@/features/catalog/catalog";
import { usePresence } from "@/features/live/presence";
import { useShouldRun } from "@/features/live/use-running";
import { useWasm } from "@/lib/hooks/use-wasm";
import {
	anchorFor,
	COLS,
	encode,
	fits,
	fold,
	isInitial,
	type Kind,
	occupied,
	type Place,
	pieces,
	ROWS,
	resetCode,
	size,
} from "./bauspiel";
import "./presence-board.css";

const OP_LIMIT = 4000;
const HOLD = 220;

const steps: Record<string, [number, number]> = {
	ArrowUp: [-1, 0],
	ArrowDown: [1, 0],
	ArrowLeft: [0, -1],
	ArrowRight: [0, 1],
};

interface Info {
	number?: string;
	title: string;
	href?: string;
	line: string;
	external?: boolean;
}

const directory: Partial<Record<Kind, Info & { kind: string }>> = {
	experiments: {
		number: "01",
		kind: "Projects",
		title: "Experiments",
		href: "/experiments",
		line: `${experiments.length} projects in graphics, audio, and distributed systems.`,
	},
	blog: {
		number: "02",
		kind: "Writing",
		title: "Blog",
		href: BLOG_URL,
		line: "Notes on what I’m building and learning.",
		external: true,
	},
	library: {
		number: "03",
		kind: "Bookmarks",
		title: "Library",
		href: `${BLOG_URL}/library`,
		line: "Books, art, podcasts, and links I’ve saved.",
		external: true,
	},
};

function describe(index: number): Info {
	const piece = pieces[index];
	const experiment = piece?.experiment;
	if (experiment) {
		return {
			number: number(experiment.number),
			title: experiment.title,
			href: experiment.href,
			line: experiment.line,
			external: experiment.external,
		};
	}
	const entry = piece && directory[piece.kind];
	if (entry) return entry;
	return {
		title: "Here now",
		line: "Tabs open on this site right now, including yours. Every move syncs through the same CRDT server as the collaborative editor.",
	};
}

interface Drag {
	index: number;
	pointer: number;
	startX: number;
	startY: number;
	offsetX: number;
	offsetY: number;
	x: number;
	y: number;
	moved: boolean;
	target: Place | null;
}

interface Hold {
	timer: number;
	pointer: number;
	x: number;
	y: number;
}

function box(index: number, place: Place): CSSProperties {
	const piece = pieces[index];
	if (!piece) return {};
	const { w, h } = size(piece, place.rot);
	const odd = place.rot % 2 === 1;
	return {
		left: `${((place.cell % COLS) * 100) / COLS}%`,
		top: `${(Math.floor(place.cell / COLS) * 100) / ROWS}%`,
		width: `${(w * 100) / COLS}%`,
		height: `${(h * 100) / ROWS}%`,
		"--art-w": odd ? `${(piece.w / piece.h) * 100}%` : "100%",
		"--art-h": odd ? `${(piece.h / piece.w) * 100}%` : "100%",
	} as CSSProperties;
}

function tick() {
	try {
		navigator.vibrate?.(8);
	} catch {}
}

export function PresenceBoard({
	head,
	about,
}: {
	head: ReactNode;
	about: ReactNode;
}) {
	const { peers, peer, cursors, sendCursor, status, text, sequence, insert } =
		usePresence();
	const { wasm, error } = useWasm();
	const boardRef = useRef<HTMLDivElement>(null);
	const shouldRun = useShouldRun(boardRef);
	const [paused, setPaused] = useState(false);
	const [local, setLocal] = useState("");
	const [selected, setSelected] = useState<number | null>(null);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [message, setMessage] = useState("");
	const dragRef = useRef<Drag | null>(null);
	const holdRef = useRef<Hold | null>(null);
	const suppressClick = useRef(false);
	dragRef.current = drag;
	const shared = !!wasm && !error;
	const log = shared ? text : local;
	const layout = useMemo(() => fold(log), [log]);
	const full = shared && sequence.length >= OP_LIMIT;
	const connected = status === "online" && peers !== null;
	const unavailable =
		status === "offline" || (status === "online" && peers === null) || !!error;
	const spins = useRef(layout.map((place) => place.rot));
	const lastRot = useRef(layout.map((place) => place.rot));
	layout.forEach((place, index) => {
		const turned = (place.rot - (lastRot.current[index] ?? 0) + 4) % 4;
		spins.current[index] = (spins.current[index] ?? 0) + turned;
		lastRot.current[index] = place.rot;
	});
	const taken = occupied(layout);
	const focus = selected ?? 0;
	const info = describe(focus);

	useEffect(() => {
		if (!message) return;
		const id = setTimeout(() => setMessage(""), 3200);
		return () => clearTimeout(id);
	}, [message]);

	useEffect(() => {
		const board = boardRef.current;
		if (!board) return;
		const block = (event: TouchEvent) => {
			if (dragRef.current) event.preventDefault();
		};
		board.addEventListener("touchmove", block, { passive: false });
		return () => board.removeEventListener("touchmove", block);
	}, []);

	const commit = (code: string) => {
		if (shared) insert(text.length, code);
		else setLocal((value) => value + code);
	};

	const place = (index: number, next: Place | null, blocked: string) => {
		const current = layout[index];
		if (!current) return false;
		if (full) {
			setMessage("The shared poster is out of moves until the room empties.");
			return false;
		}
		if (!next || !fits(layout, index, next)) {
			if (blocked) setMessage(blocked);
			return false;
		}
		if (next.cell === current.cell && next.rot === current.rot) return false;
		commit(encode(index, next));
		setMessage("");
		tick();
		return true;
	};

	const turn = (index: number) => {
		const piece = pieces[index];
		const current = layout[index];
		if (!piece?.turns || !current) return;
		const rot = (current.rot + 1) % 4;
		place(
			index,
			anchorFor(layout, index, current.cell, rot),
			"No room to turn it here.",
		);
	};

	const frame = () => {
		const board = boardRef.current;
		if (!board) return null;
		const rect = board.getBoundingClientRect();
		return {
			left: rect.left + board.clientLeft,
			top: rect.top + board.clientTop,
			cell: board.clientWidth / COLS,
		};
	};

	const lift = (
		element: HTMLElement,
		index: number,
		pointer: number,
		clientX: number,
		clientY: number,
		moved: boolean,
	) => {
		const bounds = frame();
		const current = layout[index];
		if (!bounds || !current) return;
		const rect = element.getBoundingClientRect();
		setDrag({
			index,
			pointer,
			startX: clientX,
			startY: clientY,
			offsetX: clientX - rect.left,
			offsetY: clientY - rect.top,
			x: rect.left - bounds.left,
			y: rect.top - bounds.top,
			moved,
			target: moved ? current : null,
		});
	};

	const release = () => {
		if (holdRef.current) window.clearTimeout(holdRef.current.timer);
		holdRef.current = null;
	};

	const grab = (event: PointerEvent<HTMLButtonElement>, index: number) => {
		if (event.button !== 0) return;
		const element = event.currentTarget;
		const { pointerId, clientX, clientY } = event;
		if (event.pointerType === "touch") {
			release();
			holdRef.current = {
				pointer: pointerId,
				x: clientX,
				y: clientY,
				timer: window.setTimeout(() => {
					holdRef.current = null;
					suppressClick.current = true;
					setSelected(index);
					lift(element, index, pointerId, clientX, clientY, true);
					tick();
				}, HOLD),
			};
			return;
		}
		element.setPointerCapture(pointerId);
		lift(element, index, pointerId, clientX, clientY, false);
	};

	const pull = (event: PointerEvent<HTMLButtonElement>) => {
		const hold = holdRef.current;
		if (
			hold &&
			hold.pointer === event.pointerId &&
			Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 8
		) {
			release();
		}
		if (!drag || drag.pointer !== event.pointerId) return;
		const bounds = frame();
		const piece = pieces[drag.index];
		const current = layout[drag.index];
		if (!bounds || !piece || !current) return;
		const moved =
			drag.moved ||
			Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4;
		const x = event.clientX - bounds.left - drag.offsetX;
		const y = event.clientY - bounds.top - drag.offsetY;
		const { w, h } = size(piece, current.rot);
		const col = Math.max(0, Math.min(COLS - w, Math.round(x / bounds.cell)));
		const row = Math.max(0, Math.min(ROWS - h, Math.round(y / bounds.cell)));
		const next = { cell: row * COLS + col, rot: current.rot };
		setDrag({
			...drag,
			x,
			y,
			moved,
			target: fits(layout, drag.index, next) ? next : null,
		});
	};

	const drop = (event: PointerEvent<HTMLButtonElement>) => {
		release();
		if (!drag || drag.pointer !== event.pointerId) return;
		if (drag.moved) {
			suppressClick.current = true;
			if (drag.target && place(drag.index, drag.target, "")) {
				setSelected(drag.index);
			}
		}
		setDrag(null);
	};

	const press = (index: number) => {
		if (suppressClick.current) {
			suppressClick.current = false;
			return;
		}
		if (selected === index && pieces[index]?.turns) turn(index);
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
		setSelected(index);
		const row = Math.floor(current.cell / COLS) + step[0];
		const col = (current.cell % COLS) + step[1];
		place(
			index,
			row < 0 || col < 0 || col >= COLS || row >= ROWS
				? null
				: { cell: row * COLS + col, rot: current.rot },
			"That square is taken.",
		);
	};

	const point = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === "touch") return;
		const rect = event.currentTarget.getBoundingClientRect();
		sendCursor(
			Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
			Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
		);
	};

	const hint = "Drag or tap to move anything. Tap twice to turn.";

	return (
		<section className="home__opening" aria-labelledby="home-title">
			<div className="home__bio">{head}</div>
			<div className="home__about-area">{about}</div>
			<div className="presence-board__poster">
				<p id="presence-keys" className="sr-only">
					Arrow keys move this shape on the shared poster. R turns it.
				</p>
				<div
					className="presence-board__composition"
					ref={boardRef}
					onPointerMove={point}
					style={
						{
							"--motion-state": shouldRun && !paused ? "running" : "paused",
						} as CSSProperties
					}
				>
					{Array.from({ length: COLS * ROWS }, (_, cell) =>
						taken.has(cell) ? null : (
							<button
								key={cell}
								type="button"
								tabIndex={-1}
								aria-hidden="true"
								className="presence-board__cell"
								data-armed={selected !== null || undefined}
								style={{
									left: `${((cell % COLS) * 100) / COLS}%`,
									top: `${(Math.floor(cell / COLS) * 100) / ROWS}%`,
								}}
								onClick={() => {
									if (selected === null) return;
									const current = layout[selected];
									if (!current) return;
									place(
										selected,
										anchorFor(layout, selected, cell, current.rot),
										"It doesn’t fit there.",
									);
								}}
							/>
						),
					)}
					{drag?.moved && drag.target && (
						<span
							className="presence-board__ghost"
							aria-hidden="true"
							style={box(drag.index, drag.target)}
						/>
					)}
					{layout.map((current, index) => {
						const piece = pieces[index];
						if (!piece) return null;
						const dragging = drag?.index === index && drag.moved;
						const style = box(index, current);
						if (dragging && drag) {
							style.left = `${drag.x}px`;
							style.top = `${drag.y}px`;
						}
						const meta = describe(index);
						const entry = directory[piece.kind];
						return (
							<div
								key={piece.kind}
								className={`presence-board__piece presence-board__piece--${piece.kind}`}
								style={style}
								data-selected={selected === index || undefined}
								data-dragging={dragging || undefined}
								data-blocked={(dragging && !drag?.target) || undefined}
							>
								<button
									type="button"
									className="presence-board__handle"
									aria-pressed={selected === index}
									aria-describedby="presence-keys"
									aria-label={
										meta.number ? `${meta.number}: ${meta.title}` : meta.title
									}
									onPointerDown={(event) => grab(event, index)}
									onPointerMove={pull}
									onPointerUp={drop}
									onPointerCancel={() => {
										release();
										setDrag(null);
									}}
									onContextMenu={(event) => event.preventDefault()}
									onClick={() => press(index)}
									onKeyDown={(event) => nudge(event, index)}
								>
									<span
										className="presence-board__art"
										aria-hidden="true"
										style={
											{
												"--spin": `${(spins.current[index] ?? 0) * 90}deg`,
											} as CSSProperties
										}
									>
										{piece.kind === "disc" && (
											<span className="presence-board__disc">
												<span className="presence-board__disc-eyebrow">
													Experiment / {meta.number}
												</span>
												<strong>
													{meta.title}
													<span className="presence-board__stop">.</span>
												</strong>
											</span>
										)}
										{piece.kind === "count" && (
											<span
												className="presence-board__count"
												data-live={connected || undefined}
											>
												<span className="presence-board__count-label">
													Here now
												</span>
												<span
													key={peers}
													className="presence-board__digit"
													style={
														connected && String(peers).length > 2
															? {
																	fontSize: `${72 / String(peers).length}cqh`,
																}
															: undefined
													}
												>
													{connected ? String(peers).padStart(2, "0") : "—"}
												</span>
											</span>
										)}
										{entry && (
											<>
												<span className="presence-board__glyph" />
												<span className="presence-board__entry">
													<span className="presence-board__entry-eyebrow">
														{entry.number}
														<span className="presence-board__entry-kind">
															{" "}
															/ {entry.kind}
														</span>
													</span>
													<span className="presence-board__entry-title">
														{entry.title}
													</span>
												</span>
											</>
										)}
									</span>
									{piece.experiment && (
										<span className="presence-board__plate" aria-hidden="true">
											{meta.number}
										</span>
									)}
								</button>
								{meta.href && (
									<Link
										href={meta.href}
										className="presence-board__go"
										aria-label={`Open ${meta.title}`}
									>
										<LifeArrow
											direction={meta.external ? "up-right" : "right"}
										/>
									</Link>
								)}
							</div>
						);
					})}
					{connected &&
						cursors
							.filter((cursor) => cursor.peer !== peer)
							.map((cursor) => (
								<span
									key={cursor.peer}
									className="presence-board__visitor"
									aria-hidden="true"
									style={{
										left: `${cursor.x * 100}%`,
										top: `${cursor.y * 100}%`,
									}}
								/>
							))}
				</div>
			</div>
			<div className="presence-board__label">
				<div className="presence-board__dock">
					{info.number && (
						<span className="presence-board__dock-number">{info.number}</span>
					)}
					{info.href ? (
						<Link href={info.href} className="presence-board__link">
							<span className="presence-board__link-title">{info.title}</span>
							<span aria-hidden="true">
								<LifeArrow direction={info.external ? "up-right" : "right"} />
							</span>
						</Link>
					) : (
						<span className="presence-board__link-title">
							{info.title}
							{connected ? `: ${peers}` : ""}
						</span>
					)}
					{pieces[focus]?.turns && selected !== null && (
						<button
							type="button"
							className="presence-board__turn"
							onClick={() => turn(focus)}
						>
							Turn
						</button>
					)}
				</div>
				<p className="presence-board__line">{info.line}</p>
				<div className="presence-board__meta">
					<p
						className="presence-board__caption"
						role="status"
						aria-live="polite"
					>
						{message ||
							(full
								? "Out of moves until the room empties."
								: connected
									? `${hint} ${peers === 1 ? "Only you" : `${peers} tabs`} here.`
									: unavailable
										? `${hint} Offline: moves stay in this tab.`
										: "Connecting to the shared poster…")}
					</p>
					<div className="presence-board__controls">
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
						<button
							type="button"
							aria-pressed={paused}
							onClick={() => setPaused((p) => !p)}
						>
							{paused ? "Resume motion" : "Pause motion"}
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
