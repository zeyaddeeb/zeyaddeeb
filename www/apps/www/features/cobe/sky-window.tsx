"use client";

import {
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import { angles, type Vec, vec } from "./model";
import { type Projected, SkyStage } from "./sky-stage";

export const BEAM_DEG = 7;
const KEY_STEP = 3;
const TAP_PX = 8;
const TAP_MS = 320;
const MAX_B = 86;

export interface Marker {
	id: string;
	dir: Vec;
	text: string;
}

function readPalette(el: Element) {
	const css = getComputedStyle(el);
	const pick = (name: string, fallback: string) =>
		css.getPropertyValue(name).trim() || fallback;

	return {
		ink: pick("--charcoal", "#161615"),
		deep: pick("--hc-deep", "#1f3354"),
		paper: pick("--paper", "#f5f2e9"),
		glow: pick("--yellow", "#e2a33a"),
		warm: pick("--red", "#e83025"),
		cool: pick("--hc-cool", "#3f8fd8"),
	};
}

export function SkyWindow({
	dir,
	onDir,
	reveal,
	dipole,
	markers,
	label,
	overlay,
}: {
	overlay?: (at: { cx: number; cy: number; ring: number }) => ReactNode;
	dir: Vec;
	onDir: (next: Vec) => void;
	reveal: number;
	dipole: Vec;
	markers: Marker[];
	label: string;
}) {
	const box = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const stage = useRef<SkyStage | null>(null);
	const drag = useRef<{
		x: number;
		y: number;
		l: number;
		b: number;
		t: number;
		free: boolean;
		moved: number;
	} | null>(null);
	const [grabbed, setGrabbed] = useState(false);
	const [ready, setReady] = useState(false);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [spots, setSpots] = useState<Record<string, Projected>>({});
	const dirNow = useRef(dir);

	dirNow.current = dir;

	useEffect(() => {
		const el = canvas.current;
		const frame = box.current;

		if (!el || !frame) return;

		let made: SkyStage;

		try {
			made = new SkyStage(el, "/cobe/dirbe.webp", readPalette(frame), () =>
				setReady(true),
			);
		} catch {
			return;
		}

		stage.current = made;
		made.look(dirNow.current);

		const fit = () => {
			const r = frame.getBoundingClientRect();
			const w = Math.max(1, Math.round(r.width));
			const h = Math.max(1, Math.round(r.height));

			made.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
			setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
		};

		fit();

		const ro = new ResizeObserver(fit);

		ro.observe(frame);

		return () => {
			ro.disconnect();
			stage.current = null;
			made.dispose();
		};
	}, []);

	useEffect(() => {
		const s = stage.current;

		if (!s) return;

		s.look(dir);
		s.draw();

		const next: Record<string, Projected> = {};

		for (const m of markers) next[m.id] = s.project(m.dir);

		setSpots(next);
	}, [dir, markers, size]);

	useEffect(() => {
		stage.current?.reveal(reveal, dipole);
	}, [reveal, dipole]);

	useEffect(() => {
		if (!grabbed) return;

		const outside = (e: globalThis.PointerEvent) => {
			if (!box.current?.contains(e.target as Node)) setGrabbed(false);
		};

		document.addEventListener("pointerdown", outside);

		return () => document.removeEventListener("pointerdown", outside);
	}, [grabbed]);

	const down = (e: PointerEvent<HTMLDivElement>) => {
		const { l, b } = angles(dirNow.current);
		const touch = e.pointerType === "touch";

		if (!touch || grabbed) e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = {
			x: e.clientX,
			y: e.clientY,
			l,
			b,
			t: performance.now(),
			free: !touch || grabbed,
			moved: 0,
		};
	};

	const move = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		const s = stage.current;

		if (!d || !s) return;

		d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));

		const per = s.degreesPerPixel();
		const b = d.free
			? Math.max(-MAX_B, Math.min(MAX_B, d.b + (e.clientY - d.y) * per))
			: d.b;
		const l =
			d.l +
			((e.clientX - d.x) * per) / Math.max(0.2, Math.cos((b * Math.PI) / 180));

		onDir(vec(l, b));
	};

	const up = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current;

		drag.current = null;

		if (
			d &&
			e.pointerType === "touch" &&
			d.moved < TAP_PX &&
			performance.now() - d.t < TAP_MS
		) {
			setGrabbed((g) => !g);
		}
	};

	const cancel = () => {
		drag.current = null;
	};

	const key = (e: KeyboardEvent<HTMLButtonElement>) => {
		const { l, b } = angles(dirNow.current);
		const steps: Record<string, [number, number]> = {
			ArrowLeft: [KEY_STEP, 0],
			ArrowRight: [-KEY_STEP, 0],
			ArrowUp: [0, KEY_STEP],
			ArrowDown: [0, -KEY_STEP],
		};
		const step = steps[e.key];

		if (!step) return;

		e.preventDefault();
		onDir(vec(l + step[0], Math.max(-MAX_B, Math.min(MAX_B, b + step[1]))));
	};

	const radius = stage.current?.beamRadius(BEAM_DEG) ?? 0;

	return (
		<div
			className="hc-sky"
			ref={box}
			data-ready={ready}
			data-grabbed={grabbed}
			onPointerDown={down}
			onPointerMove={move}
			onPointerUp={up}
			onPointerCancel={cancel}
		>
			<canvas className="hc-sky__canvas" ref={canvas} />
			<span className="hc-sky__touch" aria-hidden="true">
				{grabbed
					? "Looking around · tap to let go"
					: "Swipe sideways to turn · tap to look around"}
			</span>
			<button
				type="button"
				className="hc-sky__keys"
				aria-label={label}
				onKeyDown={key}
			/>
			<svg
				className="hc-sky__beam"
				viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
				aria-hidden="true"
			>
				<circle
					className="hc-sky__halo"
					cx={size.w / 2}
					cy={size.h / 2}
					r={radius}
				/>
				<circle
					className="hc-sky__ring"
					cx={size.w / 2}
					cy={size.h / 2}
					r={radius}
				/>
				<path
					className="hc-sky__ring"
					d={`M ${size.w / 2 - radius - 10} ${size.h / 2} h 7 M ${size.w / 2 + radius + 3} ${size.h / 2} h 7 M ${size.w / 2} ${size.h / 2 - radius - 10} v 7 M ${size.w / 2} ${size.h / 2 + radius + 3} v 7`}
				/>
				{overlay && size.w > 0
					? overlay({ cx: size.w / 2, cy: size.h / 2, ring: radius })
					: null}
			</svg>
			{markers.map((m) => {
				const p = spots[m.id];

				if (!p?.front || p.x < 0 || p.y < 0 || p.x > size.w || p.y > size.h) {
					return null;
				}

				return (
					<span
						key={m.id}
						className="hc-sky__mark"
						style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
						aria-hidden="true"
					>
						<span className="hc-sky__dot" />
						<span className="hc-sky__text">{m.text}</span>
					</span>
				);
			})}
		</div>
	);
}
