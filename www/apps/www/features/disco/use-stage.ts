"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
	useReducedMotion,
	useShouldRun,
} from "@/lib/hooks/use-animation-activity";
import type { FilmId } from "./film";
import { Floor, type Reading, type Spots } from "./floor";
import type { Beat } from "./lock";
import type { Popped } from "./pop-out";
import { bars, trace } from "./scope";

const BAR = 30;
const FEET = 11;
const EVERY = 0.2;
const CLOSE = 1.5;
const HOME: Spots = {};
const spectrum = new Uint8Array(1024);

interface Stage {
	screen: RefObject<HTMLDivElement | null>;
	dancers: RefObject<HTMLCanvasElement | null>;
	scope: RefObject<HTMLCanvasElement | null>;
	bars: RefObject<HTMLCanvasElement | null>;
	popped: Popped | null;
	lineup: FilmId[];
	spots: Spots;
	beat: () => Beat;
	analyser: () => AnalyserNode | null;
	onRead: (readings: Reading[], music: Beat) => void;
}

function fit(canvas: HTMLCanvasElement, view: Window = window) {
	const dpr = Math.min(view.devicePixelRatio || 1, 2);
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;

	if (canvas.width !== Math.round(width * dpr)) canvas.width = width * dpr;

	if (canvas.height !== Math.round(height * dpr)) canvas.height = height * dpr;

	const ctx = canvas.getContext("2d");

	ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

	return ctx ? { ctx, width, height } : null;
}

export function useStage(stage: Stage) {
	const floor = useRef<Floor | null>(null);
	const latest = useRef(stage);
	const visible = useShouldRun(stage.screen);
	const reduced = useReducedMotion();
	const running = visible || (Boolean(stage.popped) && !reduced);

	latest.current = stage;
	floor.current ??= new Floor();

	const paint = (now: number, frozen = false) => {
		const current = latest.current;
		const room = current.dancers.current && fit(current.dancers.current);
		const away =
			current.popped && fit(current.popped.canvas, current.popped.view);
		const lanes = current.scope.current && fit(current.scope.current);
		const levels = current.bars.current && fit(current.bars.current);
		const stageFloor = floor.current;

		if (!stageFloor) return;

		if (!frozen) stageFloor.step(now, current.beat());

		for (const place of [room, away])
			if (place)
				stageFloor.paint(place.ctx, {
					width: place.width,
					height: place.height,
					ground: place.height - BAR + FEET,
					zoom: place === away ? CLOSE : 1,
					spots: place === away ? HOME : current.spots,
				});

		if (lanes) trace(lanes.ctx, stageFloor, now, lanes);

		if (levels) bars(levels.ctx, current.analyser(), spectrum, levels);
	};

	useEffect(() => () => floor.current?.cast([]), []);

	useEffect(() => {
		floor.current?.cast(stage.lineup);
	}, [stage.lineup]);

	useEffect(() => {
		if (!reduced) return;

		const timer = setInterval(() => paint(performance.now() / 1000, true), 400);

		return () => clearInterval(timer);
	}, [reduced]);

	useEffect(() => {
		if (!running) {
			floor.current?.rest();
			return;
		}

		const clock = stage.popped?.view ?? window;
		let frame = 0;
		let told = 0;

		const tick = () => {
			const now = performance.now() / 1000;

			paint(now);

			if (floor.current && (floor.current.turned || now - told > EVERY)) {
				told = now;
				floor.current.turned = false;
				latest.current.onRead(floor.current.read(), latest.current.beat());
			}

			frame = clock.requestAnimationFrame(tick);
		};

		frame = clock.requestAnimationFrame(tick);

		return () => clock.cancelAnimationFrame(frame);
	}, [running, stage.popped]);

	return floor;
}
