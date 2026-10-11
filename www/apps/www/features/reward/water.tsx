"use client";

import { type PointerEvent, useEffect, useRef } from "react";
import { useShouldRun } from "@/lib/hooks/use-animation-activity";
import type { Rule } from "./rule";
import type { Listener } from "./run";
import { Scene } from "./scene";

const LONGEST_FRAME = 64;

interface WaterProps extends Listener {
	rule: Rule;
	reduced: boolean;
	label: string;
	spot: (text: string | null) => void;
}

export function Water({ rule, reduced, label, spot, ...listener }: WaterProps) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const scene = useRef<Scene | null>(null);
	const first = useRef(rule);
	const heard = useRef({ ...listener, spot });
	const live = useShouldRun(canvas);

	heard.current = { ...listener, spot };

	useEffect(() => {
		const el = canvas.current;

		if (!el) return;

		const made = new Scene(
			el,
			first.current,
			{
				tally: (tally) => heard.current.tally(tally),
				solving: () => heard.current.solving(),
				settled: (verdict, rule) => heard.current.settled(verdict, rule),
			},
			(text) => heard.current.spot(text),
		);
		const watcher = new ResizeObserver(([entry]) =>
			made.resize(entry?.contentRect.width ?? 0),
		);

		scene.current = made;
		watcher.observe(el);

		return () => {
			watcher.disconnect();
			scene.current = null;
		};
	}, []);

	useEffect(() => {
		if (rule === first.current) return;

		first.current = rule;
		scene.current?.change(rule, !reduced);
	}, [rule, reduced]);

	useEffect(() => {
		const made = scene.current;

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
			className="rh-water"
			role="img"
			aria-label={label}
			onPointerMove={(event) => {
				if (event.pointerType === "mouse")
					scene.current?.hover(...where(event));
			}}
			onPointerLeave={(event) => {
				if (event.pointerType === "mouse") scene.current?.leave();
			}}
			onClick={(event) => {
				const box = event.currentTarget.getBoundingClientRect();
				const made = scene.current;

				if (!made) return;

				made.drop(event.clientX - box.left, event.clientY - box.top);

				if (reduced) made.rest();
			}}
		/>
	);
}
