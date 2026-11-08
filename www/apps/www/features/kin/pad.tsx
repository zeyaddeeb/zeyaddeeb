"use client";

import { useCallback, useEffect, useRef } from "react";
import { SIDE, toInput } from "./ink";

const SIZE = 280;
const STROKE = 22;

export function Pad({
	onInput,
	preset,
	label,
}: {
	onInput: (input: Float32Array) => void;
	preset: Float32Array | null;
	label: string;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const drawing = useRef<{ x: number; y: number } | null>(null);
	const inked = useRef(false);

	const read = useCallback(() => {
		const c = canvas.current;
		const ctx = c?.getContext("2d", { willReadFrequently: true });
		if (!c || !ctx) return;
		const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
		const alpha = new Uint8ClampedArray(SIZE * SIZE);
		for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
		onInput(toInput(alpha, SIZE));
	}, [onInput]);

	const paint = useCallback((digit: Float32Array) => {
		const c = canvas.current;
		const ctx = c?.getContext("2d");
		if (!c || !ctx) return;
		ctx.clearRect(0, 0, SIZE, SIZE);
		const cell = SIZE / SIDE;
		for (let y = 0; y < SIDE; y++) {
			for (let x = 0; x < SIDE; x++) {
				const v = (digit[y * SIDE + x] + 1) / 2;
				if (v <= 0.02) continue;
				ctx.fillStyle = `rgba(255, 255, 255, ${v})`;
				ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
			}
		}
	}, []);

	useEffect(() => {
		if (preset && !inked.current) {
			paint(preset);
			onInput(preset);
		}
	}, [preset, paint, onInput]);

	const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return {
			x: ((e.clientX - r.left) / r.width) * SIZE,
			y: ((e.clientY - r.top) / r.height) * SIZE,
		};
	};

	const clear = () => {
		const ctx = canvas.current?.getContext("2d");
		ctx?.clearRect(0, 0, SIZE, SIZE);
		inked.current = false;
		onInput(new Float32Array(SIDE * SIDE).fill(-1));
	};

	return (
		<div className="kn-pad">
			<canvas
				ref={canvas}
				width={SIZE}
				height={SIZE}
				className="kn-pad__canvas"
				aria-label={label}
				role="img"
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					const ctx = canvas.current?.getContext("2d");
					if (!inked.current && ctx) ctx.clearRect(0, 0, SIZE, SIZE);
					inked.current = true;
					drawing.current = at(e);
				}}
				onPointerMove={(e) => {
					const from = drawing.current;
					const ctx = canvas.current?.getContext("2d");
					if (!from || !ctx) return;
					const to = at(e);
					ctx.strokeStyle = "#fff";
					ctx.lineWidth = STROKE;
					ctx.lineCap = "round";
					ctx.lineJoin = "round";
					ctx.beginPath();
					ctx.moveTo(from.x, from.y);
					ctx.lineTo(to.x, to.y);
					ctx.stroke();
					drawing.current = to;
				}}
				onPointerUp={() => {
					drawing.current = null;
					read();
				}}
				onPointerCancel={() => {
					drawing.current = null;
				}}
			/>
			<span className="kn-pad__foot">
				<span>Draw a digit</span>
				<button type="button" className="kn-link" onClick={clear}>
					Clear
				</button>
			</span>
		</div>
	);
}
