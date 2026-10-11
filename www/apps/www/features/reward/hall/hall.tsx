"use client";

import { type PointerEvent, useEffect, useRef } from "react";
import { useShouldRun } from "@/lib/hooks/use-animation-activity";
import type { Sheet } from "./sheet";
import { type Listener, Stage } from "./stage";

const LONGEST_FRAME = 64;

interface HallProps extends Listener {
	sheet: Sheet;
	reduced: boolean;
	label: string;
	turn: number;
}

export function Hall({ sheet, reduced, label, turn, ...listener }: HallProps) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const stage = useRef<Stage | null>(null);
	const first = useRef(sheet);
	const turned = useRef(turn);
	const heard = useRef(listener);
	const live = useShouldRun(canvas);

	heard.current = listener;

	useEffect(() => {
		const el = canvas.current;

		if (!el) return;

		const made = new Stage(el, first.current, {
			tally: (tally) => heard.current.tally(tally),
			spot: (text) => heard.current.spot(text),
		});
		const watcher = new ResizeObserver(([entry]) =>
			made.resize(entry?.contentRect.width ?? 0),
		);

		stage.current = made;
		watcher.observe(el);

		return () => {
			watcher.disconnect();
			stage.current = null;
		};
	}, []);

	useEffect(() => {
		if (sheet === first.current) return;

		first.current = sheet;
		stage.current?.change(sheet, !reduced);
	}, [sheet, reduced]);

	useEffect(() => {
		if (turn === turned.current) return;

		turned.current = turn;
		stage.current?.again();

		if (reduced) stage.current?.rest();
	}, [turn, reduced]);

	useEffect(() => {
		const made = stage.current;

		if (!made) return;

		if (!live) {
			if (reduced) made.rest();

			return;
		}

		let before = performance.now();
		let frame = requestAnimationFrame(function loop(now) {
			made.frame(Math.min(LONGEST_FRAME, now - before));
			before = now;
			frame = requestAnimationFrame(loop);
		});

		return () => cancelAnimationFrame(frame);
	}, [live, reduced]);

	const where = (event: PointerEvent<HTMLCanvasElement>) => {
		const box = event.currentTarget.getBoundingClientRect();

		return [event.clientX - box.left, event.clientY - box.top] as const;
	};

	return (
		<canvas
			ref={canvas}
			className="rh-water rh-water--hall"
			role="img"
			aria-label={label}
			onPointerMove={(event) => {
				if (event.pointerType === "mouse")
					stage.current?.hover(...where(event));
			}}
			onPointerLeave={(event) => {
				if (event.pointerType === "mouse") stage.current?.leave();
			}}
			onClick={(event) => {
				const box = event.currentTarget.getBoundingClientRect();
				const made = stage.current;

				if (!made) return;

				made.pick(event.clientX - box.left, event.clientY - box.top);

				if (reduced) made.rest();
			}}
		/>
	);
}
