"use client";

import { useEffect, useRef } from "react";

const BARS = 64;
const GAP = 1;
const TICK = 5;
const FLOOR = 0.1;
const FAINT = 0.3;

function paint(canvas: HTMLCanvasElement, bars: number[], seconds: number) {
	const context = canvas.getContext("2d");

	if (!context) return;

	const { width, height } = canvas;
	const ratio = window.devicePixelRatio || 1;
	const pitch = width / BARS;

	context.clearRect(0, 0, width, height);
	context.fillStyle = getComputedStyle(canvas).color;
	context.globalAlpha = FAINT;
	context.fillRect(0, height - ratio, width, ratio);

	for (let second = 0; second <= seconds; second++) {
		const x = Math.min(width - ratio, Math.round((second / seconds) * width));

		context.fillRect(x, height - TICK * ratio, ratio, TICK * ratio);
	}

	context.globalAlpha = 1;

	bars.forEach((level, index) => {
		const tall = Math.round(Math.max(FLOOR, level) * height);
		const x = Math.round(index * pitch);

		context.fillRect(
			x,
			height - tall,
			Math.max(ratio, Math.round((index + 1) * pitch) - x - GAP * ratio),
			tall,
		);
	});
}

export function Tape({
	rolling,
	blank,
	seconds,
	began,
	level,
}: {
	rolling: boolean;
	blank: boolean;
	seconds: number;
	began: { readonly current: number };
	level: () => number;
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const bars = useRef<number[]>([]);

	useEffect(() => {
		const el = canvas.current;

		if (!el) return;

		const fit = () => {
			const ratio = window.devicePixelRatio || 1;
			const { width, height } = el.getBoundingClientRect();

			el.width = Math.round(width * ratio);
			el.height = Math.round(height * ratio);
			paint(el, bars.current, seconds);
		};
		const watcher = new ResizeObserver(fit);

		watcher.observe(el);
		fit();

		return () => watcher.disconnect();
	}, [seconds]);

	useEffect(() => {
		if (!blank) return;

		bars.current = [];

		if (canvas.current) paint(canvas.current, bars.current, seconds);
	}, [blank, seconds]);

	useEffect(() => {
		if (!rolling) return;

		let frame = 0;
		const tick = () => {
			const spent = (performance.now() - began.current) / 1000;
			const index = Math.min(BARS - 1, Math.floor((spent / seconds) * BARS));

			while (bars.current.length <= index) bars.current.push(0);

			bars.current[index] = Math.max(bars.current[index], Math.sqrt(level()));

			if (canvas.current) paint(canvas.current, bars.current, seconds);

			frame = requestAnimationFrame(tick);
		};

		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, [rolling, seconds, began, level]);

	return <canvas ref={canvas} className="sb-tape" />;
}
