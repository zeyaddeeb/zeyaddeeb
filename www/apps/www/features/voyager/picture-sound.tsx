"use client";

import { type PointerEvent, useEffect, useRef, useState } from "react";
import { LINES, line, seconds } from "./cover";

const W = 512;
const H = 384;
const LINE_S = seconds(line);
const SYNC = 0.1;

function calibration(ctx: CanvasRenderingContext2D) {
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, W, H);
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 16;
	ctx.beginPath();
	ctx.arc(W / 2, H / 2, 128, 0, Math.PI * 2);
	ctx.stroke();
}

type Trace = { samples: Float32Array; per: number; row: number };

function fit(c: HTMLCanvasElement) {
	const r = c.getBoundingClientRect();
	const d = Math.min(2, window.devicePixelRatio || 1);
	const w = Math.max(1, Math.round(r.width * d));
	const h = Math.max(1, Math.round(r.height * d));
	if (c.width !== w) c.width = w;
	if (c.height !== h) c.height = h;
	return d;
}

function trace(c: HTMLCanvasElement, d: number, t: Trace | null) {
	const sc = c.getContext("2d");
	if (!sc) return;
	const w = c.width;
	const h = c.height;
	sc.clearRect(0, 0, w, h);
	sc.lineWidth = 1.5 * d;
	sc.lineJoin = "round";
	sc.beginPath();
	if (!t) {
		sc.strokeStyle = "rgba(245, 242, 233, 0.34)";
		sc.moveTo(0, h / 2);
		sc.lineTo(w, h / 2);
		sc.stroke();
		return;
	}
	sc.strokeStyle = "#e8b355";
	for (let k = 0; k < t.per; k++) {
		const v = t.samples[t.row * t.per + k];
		const px = (k / (t.per - 1)) * w;
		const py = h / 2 - v * (h / 2 - 3 * d);
		if (k) sc.lineTo(px, py);
		else sc.moveTo(px, py);
	}
	sc.stroke();
}

export function encode(pixels: Uint8ClampedArray, rate: number) {
	const per = Math.round(rate * LINE_S);
	const sync = Math.round(per * SYNC);
	const out = new Float32Array(per * LINES);
	for (let x = 0; x < LINES; x++) {
		const col = Math.floor((x / LINES) * W);
		for (let k = 0; k < per; k++) {
			let v: number;
			if (k < sync) v = -0.9;
			else {
				const y = Math.min(H - 1, Math.floor(((k - sync) / (per - sync)) * H));
				const i = (y * W + col) * 4;
				v = -0.35 + (pixels[i] / 255) * 1.1;
			}
			out[x * per + k] = v;
		}
	}
	return { samples: out, per, sync };
}

type State = "idle" | "playing" | "done";

function PlayIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M4.5 2.8v10.4L13 8z" fill="currentColor" stroke="none" />
		</svg>
	);
}

function StopIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M4 4h8v8H4z" fill="currentColor" stroke="none" />
		</svg>
	);
}

function CircleIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<circle cx="8" cy="8" r="5" />
		</svg>
	);
}

export function PictureSound() {
	const source = useRef<HTMLCanvasElement>(null);
	const screen = useRef<HTMLCanvasElement>(null);
	const scope = useRef<HTMLCanvasElement>(null);
	const count = useRef<HTMLElement>(null);
	const audio = useRef<AudioContext | null>(null);
	const playing = useRef<AudioBufferSourceNode | null>(null);
	const raf = useRef(0);
	const wave = useRef<Trace | null>(null);
	const ratio = useRef(1);
	const pen = useRef<{ x: number; y: number } | null>(null);
	const [state, setState] = useState<State>("idle");
	const [drawn, setDrawn] = useState(false);
	const [armed, setArmed] = useState(false);

	const setCount = (n: number) => {
		if (count.current) count.current.textContent = String(n);
	};

	const halt = () => {
		cancelAnimationFrame(raf.current);
		const node = playing.current;
		playing.current = null;
		node?.stop();
	};

	const paint = () => {
		if (scope.current) trace(scope.current, ratio.current, wave.current);
	};

	const blank = () => {
		screen.current?.getContext("2d")?.clearRect(0, 0, W, H);
		wave.current = null;
		paint();
		setCount(0);
	};

	useEffect(() => {
		const ctx = source.current?.getContext("2d");
		if (ctx) calibration(ctx);
		const c = scope.current;
		if (c) ratio.current = fit(c);
		blank();
		const ro = new ResizeObserver(() => {
			if (!c) return;
			ratio.current = fit(c);
			trace(c, ratio.current, wave.current);
		});
		if (c) ro.observe(c);
		return () => {
			ro.disconnect();
			halt();
			audio.current?.close();
		};
	}, []);

	const point = (e: PointerEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return {
			x: ((e.clientX - r.left) / r.width) * W,
			y: ((e.clientY - r.top) / r.height) * H,
		};
	};

	const down = (e: PointerEvent<HTMLCanvasElement>) => {
		if (e.pointerType === "touch" && !armed) return;
		const ctx = source.current?.getContext("2d");
		if (!ctx) return;
		if (!drawn) {
			ctx.fillStyle = "#000";
			ctx.fillRect(0, 0, W, H);
			setDrawn(true);
		}
		if (state !== "idle") {
			halt();
			blank();
			setState("idle");
		}
		e.currentTarget.setPointerCapture(e.pointerId);
		pen.current = point(e);
		ctx.fillStyle = "#fff";
		ctx.beginPath();
		ctx.arc(pen.current.x, pen.current.y, 7, 0, Math.PI * 2);
		ctx.fill();
	};

	const move = (e: PointerEvent<HTMLCanvasElement>) => {
		const ctx = source.current?.getContext("2d");
		if (!ctx || !pen.current) return;
		const p = point(e);
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 14;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(pen.current.x, pen.current.y);
		ctx.lineTo(p.x, p.y);
		ctx.stroke();
		pen.current = p;
	};

	const up = (e: PointerEvent<HTMLCanvasElement>) => {
		if (e.pointerType === "touch" && !armed && e.type === "pointerup")
			setArmed(true);
		pen.current = null;
	};

	const reset = () => {
		halt();
		const ctx = source.current?.getContext("2d");
		if (ctx) calibration(ctx);
		blank();
		setDrawn(false);
		setArmed(false);
		setState("idle");
	};

	const stop = () => {
		halt();
		setState("done");
	};

	const play = async () => {
		const src = source.current?.getContext("2d");
		const out = screen.current?.getContext("2d");
		if (!src || !out) return;
		setArmed(false);
		audio.current ??= new AudioContext();
		const ac = audio.current;
		await ac.resume();
		halt();
		const { samples, per, sync } = encode(
			src.getImageData(0, 0, W, H).data,
			ac.sampleRate,
		);
		const buffer = ac.createBuffer(1, samples.length, ac.sampleRate);
		buffer.copyToChannel(samples, 0);
		const node = ac.createBufferSource();
		node.buffer = buffer;
		const gain = ac.createGain();
		gain.gain.value = 0.18;
		node.connect(gain).connect(ac.destination);
		out.fillStyle = "#0c0c0b";
		out.fillRect(0, 0, W, H);
		const start = ac.currentTime + 0.05;
		node.start(start);
		playing.current = node;
		setState("playing");
		let drawnLines = 0;
		let shown = -1;
		let stamp = 0;
		const colW = W / LINES;
		const frame = (now: number) => {
			if (playing.current !== node) return;
			const t = ac.currentTime - start;
			const upto = Math.min(LINES, Math.max(0, Math.floor(t / LINE_S)));
			for (let x = drawnLines; x < upto; x++) {
				for (let y = 0; y < H; y += 2) {
					const k = sync + Math.floor((y / H) * (per - sync));
					const v = samples[x * per + k];
					const b = Math.max(0, Math.min(255, ((v + 0.35) / 1.1) * 255));
					out.fillStyle = `rgb(${b},${Math.round(b * 0.93)},${Math.round(b * 0.8)})`;
					out.fillRect(x * colW, y, colW + 0.5, 2);
				}
			}
			drawnLines = upto;
			const cur = Math.min(LINES - 1, upto);
			if (cur !== shown) {
				shown = cur;
				wave.current = { samples, per, row: cur };
				paint();
			}
			if (now - stamp > 100 || upto >= LINES) {
				stamp = now;
				setCount(Math.min(LINES, upto));
			}
			if (upto < LINES) raf.current = requestAnimationFrame(frame);
			else {
				playing.current = null;
				setState("done");
			}
		};
		raf.current = requestAnimationFrame(frame);
	};

	const label = drawn ? "Play your drawing" : "Play the picture";

	return (
		<div className="vg-sound" data-state={state}>
			<div className="vg-sound__pair">
				<figure className="vg-sound__in">
					<canvas
						ref={source}
						width={W}
						height={H}
						className="vg-sound__source"
						data-armed={armed ? "" : undefined}
						onPointerDown={down}
						onPointerMove={move}
						onPointerUp={up}
						onPointerCancel={up}
						aria-label="The picture to encode. Draw on it to replace the circle."
						role="img"
					/>
					<figcaption className="vg-sound__cap vg-sound__swap">
						<span data-on={!drawn && !armed ? "" : undefined}>
							Picture 1, the circle. Draw to replace it.
						</span>
						<span data-on={armed && !drawn ? "" : undefined}>
							Ready. Draw with a finger.
						</span>
						<span data-on={drawn ? "" : undefined}>Your drawing.</span>
					</figcaption>
				</figure>
				<canvas
					ref={scope}
					className="vg-sound__scope"
					role="img"
					aria-label="The waveform of the line being played"
				/>
				<figure className="vg-sound__out">
					<div className="vg-sound__screen">
						<canvas
							ref={screen}
							width={W}
							height={H}
							role="img"
							aria-label="The picture decoded from sound"
						/>
						<button
							type="button"
							className="vg-pill vg-sound__play"
							onClick={play}
						>
							<PlayIcon />
							<span className="vg-sound__full">{label}</span>
							<span className="vg-sound__short">Play</span>
						</button>
					</div>
					<figcaption className="vg-sound__cap vg-sound__swap">
						<span data-on={state === "idle" ? "" : undefined}>
							The picture, decoded from its sound.
						</span>
						<span data-on={state === "idle" ? undefined : ""}>
							Line <b ref={count}>0</b> of {LINES}
						</span>
					</figcaption>
				</figure>
			</div>
			<div className="vg-sound__bar">
				<p className="vg-sound__meta">
					<span>
						{LINES} lines × {(LINE_S * 1000).toFixed(2)}
						{"\u00a0"}ms
					</span>{" "}
					<span>
						= {(LINES * LINE_S).toFixed(2)}
						{"\u00a0"}s of sound
					</span>
				</p>
				<div className="vg-sound__actions">
					<button
						type="button"
						className="vg-icon-button"
						aria-label="Back to the circle"
						data-hide={drawn ? undefined : ""}
						onClick={reset}
					>
						<CircleIcon />
					</button>
					<button
						type="button"
						className="vg-icon-button"
						aria-label={state === "playing" ? "Stop" : "Play again"}
						data-hide={state === "idle" ? "" : undefined}
						onClick={state === "playing" ? stop : play}
					>
						{state === "playing" ? <StopIcon /> : <PlayIcon />}
					</button>
				</div>
			</div>
		</div>
	);
}
