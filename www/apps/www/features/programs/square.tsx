"use client";

import type { Crowd } from "@zeyaddeeb/wasm";
import { useCallback, useEffect, useRef } from "react";
import { number, parse, write } from "./formula";
import { rgba, type Tile } from "./model";

const TONES = [
	"--ep-tone-0",
	"--ep-tone-1",
	"--ep-tone-2",
	"--ep-tone-3",
	"--ep-tone-4",
];
const MAX_RES = 1100;
const LABEL_W = 104;
const LABEL_H = 38;
const RING = 12;

export type Slot = 0 | 1;

interface Paint {
	palette: Uint32Array;
	paper: string;
	ink: string;
	ghost: string;
	mark: string;
	inks: string[];
	font: string;
}

interface Ghost {
	x: number;
	y: number;
	w: number;
	h: number;
}

function readPaint(el: HTMLElement): Paint {
	const css = getComputedStyle(el);
	const get = (name: string) => css.getPropertyValue(name).trim();

	return {
		palette: new Uint32Array(TONES.map((t) => rgba(get(t)))),
		paper: get("--paper"),
		ink: get("--ink"),
		ghost: get("--ep-ghost"),
		mark: get("--ep-mark"),
		inks: TONES.map((_, i) => get(`--ep-on-${i}`)),
		font: get("--font-mono") || "monospace",
	};
}

function label(tile: Tile) {
	if (tile.kind === "memo") {
		return tile.seeds.length === 0
			? `start ${number(tile.next ?? 0)}`
			: `remember, then ${number(tile.next ?? 0)}`;
	}

	return write(parse(tile.rule));
}

function fit(g: CanvasRenderingContext2D, text: string, width: number) {
	if (g.measureText(text).width <= width) return text;

	let cut = text;

	while (cut.length > 1 && g.measureText(`${cut}…`).width > width) {
		cut = cut.slice(0, -1);
	}

	return `${cut.trimEnd()}…`;
}

function ring(
	g: CanvasRenderingContext2D,
	[x = 0, y = 0, w = 0, h = 0]: number[],
	radius: number,
) {
	g.beginPath();
	g.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2);
	g.stroke();
}

export function Square({
	crowd,
	slot,
	version,
	hasData,
	focus,
	reduced,
	name,
	onPick,
}: {
	crowd: Crowd | null;
	slot: Slot;
	version: number;
	hasData: boolean;
	focus: Tile | null;
	reduced: boolean;
	name: string;
	onPick: (tile: Tile | null) => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	const base = useRef<HTMLCanvasElement>(null);
	const veil = useRef<HTMLCanvasElement>(null);
	const mark = useRef<HTMLCanvasElement>(null);
	const scratch = useRef<HTMLCanvasElement | null>(null);
	const ghosts = useRef<Ghost[]>([]);
	const size = useRef(0);
	const res = useRef(0);
	const pending = useRef(0);
	const live = useRef({ hasData, focus });

	live.current = { hasData, focus };

	const drawMark = useCallback(() => {
		const el = box.current;
		const canvas = mark.current;
		const px = base.current?.width ?? 0;

		if (!el || !canvas || !crowd || res.current === 0 || px === 0) return;

		if (canvas.width !== px) {
			canvas.width = px;
			canvas.height = px;
		}

		const g = canvas.getContext("2d");

		if (!g) return;

		g.clearRect(0, 0, px, px);

		const tile = live.current.focus;

		if (!tile) return;

		const paint = readPaint(el);
		const k = px / res.current;
		const css = px / size.current;
		const r = Array.from(crowd.locate(slot, tile.id), (v) => v * k);
		const [x = 0, y = 0, w = 0, h = 0] = r;

		g.lineWidth = 3 * css;
		g.strokeStyle = paint.mark;

		if (Math.min(w, h) >= 10 * css) {
			g.strokeRect(x + 1.5 * css, y + 1.5 * css, w - 3 * css, h - 3 * css);
		} else if (w > 0 || h > 0) {
			ring(g, r, (RING + 4) * css);
		}
	}, [crowd, slot]);

	const render = useCallback(() => {
		const el = box.current;
		const canvas = base.current;

		if (!el || !canvas || !crowd || size.current <= 0) return;

		const paint = readPaint(el);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const px = Math.round(size.current * dpr);
		const r = Math.min(px, MAX_RES);
		const bytes = crowd.paint(slot, r, r, slot, paint.palette);
		const image = new ImageData(
			new Uint8ClampedArray(
				bytes.buffer as ArrayBuffer,
				bytes.byteOffset,
				bytes.length,
			),
			r,
			r,
		);
		const off = scratch.current ?? document.createElement("canvas");

		scratch.current = off;
		res.current = r;

		if (off.width !== r) {
			off.width = r;
			off.height = r;
		}

		off.getContext("2d")?.putImageData(image, 0, 0);

		if (canvas.width !== px) {
			canvas.width = px;
			canvas.height = px;
		}

		const g = canvas.getContext("2d");

		if (!g) return;

		const k = px / r;
		const css = px / size.current;
		const map = slot === 0 && live.current.hasData;

		g.fillStyle = paint.paper;
		g.fillRect(0, 0, px, px);

		if (map && ghosts.current.length > 0) {
			g.strokeStyle = paint.ghost;
			g.lineWidth = Math.max(1, dpr);

			for (const q of ghosts.current) {
				g.strokeRect(q.x * px, q.y * px, q.w * px, q.h * px);
			}
		}

		g.imageSmoothingEnabled = true;
		g.drawImage(off, 0, 0, px, px);

		const tiles: Tile[] = JSON.parse(
			crowd.tiles(slot, (7 * r) / size.current) || "[]",
		);

		g.strokeStyle = paint.ink;

		for (const tile of tiles) {
			const w = tile.w * k;
			const h = tile.h * k;

			g.lineWidth = Math.min(w, h) >= 36 * css ? 2 * dpr : dpr;
			g.strokeRect(tile.x * k, tile.y * k, w, h);
		}

		g.textBaseline = "top";

		for (const tile of tiles) {
			const w = tile.w * k;
			const h = tile.h * k;

			if (w < LABEL_W * css || h < LABEL_H * css) continue;

			const pad = 8 * css;

			g.fillStyle = paint.inks[tile.tone] ?? paint.ink;
			g.font = `500 ${12 * css}px ${paint.font}`;
			g.fillText(
				fit(g, label(tile), w - 2 * pad),
				tile.x * k + pad,
				tile.y * k + pad,
			);

			if (h >= 56 * css) {
				g.font = `400 ${10.5 * css}px ${paint.font}`;
				g.globalAlpha = 0.8;

				const said =
					tile.kind === "silent"
						? "never answers"
						: `says ${number(tile.next ?? 0)}`;

				g.fillText(
					fit(g, `${said} · ${tile.bits} bits`, w - 2 * pad),
					tile.x * k + pad,
					tile.y * k + pad + 17 * css,
				);
				g.globalAlpha = 1;
			}
		}

		if (map) {
			const leaders: Tile[] = JSON.parse(crowd.leaders(slot, 3) || "[]");

			g.strokeStyle = paint.ink;
			g.lineWidth = 2 * dpr;

			for (const tile of leaders) {
				if (Math.max(tile.w, tile.h) * k >= 14 * css) continue;

				ring(g, [tile.x * k, tile.y * k, tile.w * k, tile.h * k], RING * css);
			}
		}

		if (slot === 0 && !live.current.hasData && ghosts.current.length === 0) {
			ghosts.current = JSON.parse(
				crowd.tiles(slot, (6 * r) / size.current) || "[]",
			).map((q: Tile) => ({
				x: q.x / r,
				y: q.y / r,
				w: q.w / r,
				h: q.h / r,
			}));
		}

		drawMark();
	}, [crowd, slot, drawMark]);

	useEffect(() => {
		const el = box.current;

		if (!el) return;

		const ro = new ResizeObserver(([entry]) => {
			const next = Math.floor(entry?.contentRect.width ?? 0);

			if (next === size.current) return;

			size.current = next;
			render();
		});

		ro.observe(el);

		return () => ro.disconnect();
	}, [render]);

	useEffect(() => {
		const canvas = base.current;
		const over = veil.current;

		if (!canvas || !over || !crowd) return;

		if (version > 0 && !reduced && canvas.width > 0) {
			over.width = canvas.width;
			over.height = canvas.height;
			over.getContext("2d")?.drawImage(canvas, 0, 0);
			over.style.transition = "none";
			over.style.opacity = "1";
			void over.offsetWidth;
			over.style.transition = "";
			over.style.opacity = "0";
		}

		render();
	}, [crowd, version, reduced, render]);

	useEffect(() => {
		live.current.focus = focus;
		drawMark();
	}, [focus, drawMark]);

	const pick = (clientX: number, clientY: number) => {
		const canvas = base.current;

		if (!canvas || !crowd || res.current === 0) return;

		const rect = canvas.getBoundingClientRect();
		const scale = res.current / rect.width;
		const found = crowd.pick(
			slot,
			(clientX - rect.left) * scale,
			(clientY - rect.top) * scale,
		);

		onPick(found ? (JSON.parse(found) as Tile) : null);
	};

	return (
		<div className="ep-square" ref={box}>
			<canvas
				ref={base}
				className="ep-square__canvas"
				role="img"
				aria-label={name}
				onPointerMove={(e) => {
					if (e.pointerType !== "mouse") return;

					const { clientX, clientY } = e;

					cancelAnimationFrame(pending.current);
					pending.current = requestAnimationFrame(() => pick(clientX, clientY));
				}}
				onPointerLeave={(e) => {
					if (e.pointerType !== "mouse") return;

					cancelAnimationFrame(pending.current);
					onPick(null);
				}}
				onPointerDown={(e) => {
					if (e.pointerType !== "mouse") pick(e.clientX, e.clientY);
				}}
			/>
			<canvas ref={veil} className="ep-square__veil" />
			<canvas ref={mark} className="ep-square__mark" />
		</div>
	);
}
