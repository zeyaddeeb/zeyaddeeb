"use client";

import { useEffect, useRef, useState } from "react";
import { DELFT } from "./delft";
import type { Clock, Trial } from "./protocol";
import type { Site } from "./sites";
import type { Started } from "./use-dealer";

interface Props {
	pair: [Site, Site];
	lightMs: number;
	started: Started | null;
	clocks: { west: Clock; east: Clock } | null;
	trials: readonly Trial[];
	delft?: boolean;
}

interface Palette {
	paper: string;
	yellow: string;
	red: string;
	blue: string;
	mono: string;
	display: string;
}

const PAD = { left: 50, right: 22, top: 46, bottom: 18 };
const PACKET_EVERY = 48;

function palette(el: Element): Palette {
	const css = getComputedStyle(el);
	const v = (name: string, fallback: string) =>
		css.getPropertyValue(name).trim() || fallback;

	return {
		paper: v("--paper", "#f4efe6"),
		yellow: v("--yellow", "#f2c230"),
		red: v("--red", "#d9362b"),
		blue: v("--blue", "#2f5fd0"),
		mono: v("--font-mono", "monospace"),
		display: v("--font-display", "sans-serif"),
	};
}

function median(values: number[]) {
	if (values.length === 0) return 0;

	const sorted = [...values].sort((a, b) => a - b);

	return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function quantile(values: number[], q: number) {
	if (values.length === 0) return 0;

	const sorted = [...values].sort((a, b) => a - b);

	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
	);
}

function drawDelft(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	p: Palette,
) {
	const top = 6;
	const bottom = -0.6;
	const inset = Math.min(84, w * 0.17);
	const xa = PAD.left + inset;
	const xb = w - PAD.right - inset;
	const y = (t: number) =>
		h -
		PAD.bottom -
		((t - bottom) / (top - bottom)) * (h - PAD.top - PAD.bottom);
	const done = DELFT.choiceUs + DELFT.readoutUs;

	ctx.clearRect(0, 0, w, h);
	ctx.font = `11px ${p.mono}`;
	ctx.textBaseline = "middle";
	for (let t = 0; t <= top; t += 1) {
		ctx.globalAlpha = t === 0 ? 0.32 : 0.14;
		ctx.strokeStyle = p.paper;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(PAD.left, y(t) + 0.5);
		ctx.lineTo(w - PAD.right, y(t) + 0.5);
		ctx.stroke();
		ctx.globalAlpha = 0.6;
		ctx.fillStyle = p.paper;
		ctx.textAlign = "right";
		ctx.fillText(`${t} µs`, PAD.left - 8, y(t));
	}

	ctx.globalAlpha = 0.16;
	ctx.fillStyle = p.red;
	for (const x of [xa, xb])
		ctx.fillRect(x - 9, y(top), 18, y(DELFT.lightUs) - y(top));

	ctx.globalAlpha = 0.5;
	ctx.strokeStyle = p.paper;
	for (const x of [xa, xb]) {
		ctx.beginPath();
		ctx.moveTo(x + 0.5, y(bottom));
		ctx.lineTo(x + 0.5, y(top));
		ctx.stroke();
	}

	ctx.globalAlpha = 0.95;
	ctx.strokeStyle = p.yellow;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(xa, y(0));
	ctx.lineTo(xb, y(DELFT.lightUs));
	ctx.moveTo(xb, y(0));
	ctx.lineTo(xa, y(DELFT.lightUs));
	ctx.stroke();

	for (const x of [xa, xb]) {
		ctx.globalAlpha = 1;
		ctx.fillStyle = p.yellow;
		ctx.fillRect(x - 3, y(DELFT.randomUs), 6, y(0) - y(DELFT.randomUs));
		ctx.globalAlpha = 0.45;
		ctx.fillStyle = p.paper;
		ctx.fillRect(
			x - 3,
			y(DELFT.choiceUs),
			6,
			y(DELFT.randomUs) - y(DELFT.choiceUs),
		);
		ctx.globalAlpha = 0.9;
		ctx.fillRect(x - 3, y(done), 6, y(DELFT.choiceUs) - y(done));
	}

	ctx.globalAlpha = 0.8;
	ctx.fillStyle = p.paper;
	ctx.textAlign = "right";
	ctx.fillText("axis", xa - 10, y(DELFT.randomUs / 2));
	ctx.fillText("readout", xa - 10, y((DELFT.choiceUs + done) / 2));
	ctx.fillText(`${done.toFixed(2)} µs`, xa - 10, y(done) + 2);
	ctx.textAlign = "left";
	ctx.fillStyle = p.yellow;
	ctx.fillText(`${DELFT.lightUs} µs`, xb + 10, y(DELFT.lightUs) - 6);
	ctx.fillStyle = p.paper;
	ctx.fillText("90 ns later", xb + 10, y(DELFT.lightUs) + 8);

	ctx.globalAlpha = 1;
	ctx.fillStyle = p.paper;
	ctx.font = `500 15px ${p.display}`;
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
	ctx.fillText("Lab A", xa - 6, 18);
	ctx.textAlign = "right";
	ctx.fillText("Lab B", xb + 6, 18);
	ctx.font = `11px ${p.mono}`;
	ctx.globalAlpha = 0.6;
	ctx.textAlign = "left";
	ctx.fillText("Delft", xa - 6, 34);
	ctx.textAlign = "right";
	ctx.fillText(`${DELFT.metres.toLocaleString("en-US")} m away`, xb + 6, 34);

	ctx.globalAlpha = 0.7;
	ctx.fillStyle = p.paper;
	ctx.textAlign = "center";
	ctx.fillText(
		w < 480 ? "Published timing" : "Published timing of every trial",
		(xa + xb) / 2,
		y(top * 0.85),
	);
	ctx.globalAlpha = 1;
}

function draw(
	ctx: CanvasRenderingContext2D,
	w: number,
	h: number,
	p: Palette,
	{ pair, lightMs, started, clocks, trials }: Props,
) {
	const [west, east] = pair;
	const boundMs = clocks
		? (clocks.west.bound_ns + clocks.east.bound_ns) / 1e6
		: 0;
	const dials = trials.flatMap((t) =>
		[t.west.dial, t.east.dial].filter((d): d is number => d !== null),
	);
	const base = median(dials) / 1000;
	const commits = trials.flatMap((t) =>
		[t.west.commit, t.east.commit].filter((c): c is number => c !== null),
	);
	const reach = commits.length ? quantile(commits, 0.98) / 1000 - base : 0;
	const top = Math.ceil(Math.max(30, lightMs + 8, reach + 6) / 10) * 10;
	const bottom = -Math.max(4, top * 0.12);
	const xw = PAD.left + 18;
	const xe = w - PAD.right - 18;
	const y = (t: number) =>
		h -
		PAD.bottom -
		((t - bottom) / (top - bottom)) * (h - PAD.top - PAD.bottom);

	ctx.clearRect(0, 0, w, h);
	ctx.lineCap = "butt";

	ctx.font = `11px ${p.mono}`;
	ctx.textBaseline = "middle";
	for (let t = 0; t <= top; t += 10) {
		ctx.globalAlpha = t === 0 ? 0.32 : 0.14;
		ctx.strokeStyle = p.paper;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(PAD.left, y(t) + 0.5);
		ctx.lineTo(w - PAD.right, y(t) + 0.5);
		ctx.stroke();
		ctx.globalAlpha = 0.6;
		ctx.fillStyle = p.paper;
		ctx.textAlign = "right";
		ctx.fillText(`${t} ms`, PAD.left - 8, y(t));
	}

	const threshold = Math.max(0, lightMs - boundMs);

	ctx.globalAlpha = 0.16;
	ctx.fillStyle = p.red;
	for (const x of [xw, xe])
		ctx.fillRect(x - 9, y(top), 18, y(threshold) - y(top));

	ctx.globalAlpha = 0.5;
	ctx.strokeStyle = p.paper;
	ctx.lineWidth = 1;
	for (const x of [xw, xe]) {
		ctx.beginPath();
		ctx.moveTo(x + 0.5, y(bottom));
		ctx.lineTo(x + 0.5, y(top));
		ctx.stroke();
	}

	ctx.globalAlpha = 0.95;
	ctx.strokeStyle = p.yellow;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(xw, y(0));
	ctx.lineTo(xe, y(lightMs));
	ctx.moveTo(xe, y(0));
	ctx.lineTo(xw, y(lightMs));
	ctx.stroke();

	if (boundMs > 0) {
		ctx.setLineDash([3, 3]);
		ctx.globalAlpha = 0.7;
		for (const x of [xw, xe]) {
			ctx.beginPath();
			ctx.moveTo(x - 12, y(threshold));
			ctx.lineTo(x + 12, y(threshold));
			ctx.stroke();
		}
		ctx.setLineDash([]);
	}

	const packets = trials.filter(
		(t, i) =>
			i % PACKET_EVERY === 0 && t.west.heard !== null && t.east.dial !== null,
	);

	ctx.strokeStyle = p.blue;
	ctx.lineWidth = 1.25;
	ctx.globalAlpha = 0.75;
	for (const t of packets) {
		ctx.beginPath();
		ctx.moveTo(xe, y((t.east.dial ?? 0) / 1000 - base));
		ctx.lineTo(xw, y((t.west.heard ?? 0) / 1000 - base));
		ctx.stroke();
	}

	const mark = (x: number, t: number, color: string, alpha: number) => {
		ctx.globalAlpha = alpha;
		ctx.fillStyle = color;
		ctx.fillRect(x - 7, Math.round(y(t)) - 1, 14, 2);
	};

	for (const t of trials) {
		const pairs: [number, number | null, number | null, number][] = [
			[xw, t.west.dial, t.west.commit, t.answers[0]],
			[xe, t.east.dial, t.east.commit, t.answers[1]],
		];

		for (const [x, dial, commit, answer] of pairs) {
			if (dial === null || commit === null) continue;

			const at = commit / 1000 - base;
			const late = at >= threshold;

			mark(x, dial / 1000 - base, p.paper, 0.05);
			mark(
				x,
				at,
				late ? p.red : p.paper,
				answer === 2 ? 0.04 : late ? 0.3 : 0.12,
			);
		}
	}

	ctx.globalAlpha = 1;
	ctx.fillStyle = p.paper;
	ctx.font = `500 15px ${p.display}`;
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "left";
	ctx.fillText(west.short, xw - 6, 18);
	ctx.textAlign = "right";
	ctx.fillText(east.short, xe + 6, 18);
	ctx.font = `11px ${p.mono}`;
	ctx.globalAlpha = 0.6;
	ctx.textAlign = "left";
	ctx.fillText(west.cloud, xw - 6, 34);
	ctx.textAlign = "right";
	ctx.fillText(east.cloud, xe + 6, 34);

	ctx.globalAlpha = 0.95;
	ctx.fillStyle = p.yellow;
	ctx.textAlign = "center";
	const mid = (xw + xe) / 2;
	const crossing = Math.min(y(lightMs / 2) - 18, y(0) - 14);

	ctx.fillText(
		`light ${lightMs.toFixed(lightMs < 1 ? 2 : 1)} ms`,
		mid,
		crossing,
	);

	if (started?.browser || (!started && trials.length === 0)) {
		ctx.globalAlpha = 0.7;
		ctx.fillStyle = p.paper;
		ctx.fillText(
			started?.browser
				? "No timestamps: this shuffle never left your browser"
				: "Dials and answers land here",
			mid,
			y(top * 0.72),
		);
	}

	ctx.globalAlpha = 1;
}

export function Spacetime(props: Props) {
	const wrap = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const [size, setSize] = useState<[number, number]>([0, 0]);

	useEffect(() => {
		const el = wrap.current;

		if (!el) return;

		const fit = () => {
			const r = el.getBoundingClientRect();

			setSize((s) =>
				s[0] === Math.round(r.width) && s[1] === Math.round(r.height)
					? s
					: [Math.round(r.width), Math.round(r.height)],
			);
		};
		const ro = new ResizeObserver(fit);

		ro.observe(el);
		fit();

		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		const el = canvas.current;
		const [w, h] = size;

		if (!el || w === 0 || h === 0) return;

		const dpr = Math.min(2, window.devicePixelRatio || 1);

		el.width = Math.round(w * dpr);
		el.height = Math.round(h * dpr);

		const ctx = el.getContext("2d");

		if (!ctx) return;

		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (props.delft) drawDelft(ctx, w, h, palette(el));
		else draw(ctx, w, h, palette(el), props);
	});

	return (
		<div ref={wrap} className="me-spacetime">
			<canvas
				ref={canvas}
				className="me-spacetime__canvas"
				role="img"
				aria-label={
					props.delft
						? `Spacetime diagram of the 2015 Delft test: lab A on the left, lab B ${DELFT.metres} m away on the right. Each lab finishes its random choice and readout ${(DELFT.choiceUs + DELFT.readoutUs).toFixed(2)} µs after starting, before light from the other lab arrives at ${DELFT.lightUs} µs.`
						: `Spacetime diagram: ${props.pair[0].place} on the left, ${props.pair[1].place} on the right, time rising upward. Light needs ${props.lightMs.toFixed(1)} ms to cross.`
				}
			/>
		</div>
	);
}
