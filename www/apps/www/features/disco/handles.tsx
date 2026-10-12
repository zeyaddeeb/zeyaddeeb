"use client";

import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { type FilmId, filmed } from "./film";
import { homes, type Spots } from "./floor";

interface HandlesProps {
	lineup: FilmId[];
	spots: Spots;
	onMove: (id: FilmId, x: number, y: number) => void;
	onHome: (id: FilmId) => void;
}

interface Grip {
	id: FilmId;
	x: number;
	y: number;
}

const STEPS: Record<string, [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

export function Handles({ lineup, spots, onMove, onHome }: HandlesProps) {
	const grip = useRef<Grip | null>(null);
	const places = homes(lineup.length);

	const hold = (id: FilmId, event: PointerEvent<HTMLButtonElement>) => {
		grip.current = {
			id,
			x: event.clientX - (spots[id]?.x ?? 0),
			y: event.clientY - (spots[id]?.y ?? 0),
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const drag = (event: PointerEvent<HTMLButtonElement>) => {
		const held = grip.current;

		if (held) onMove(held.id, event.clientX - held.x, event.clientY - held.y);
	};

	const drop = () => {
		grip.current = null;
	};

	const nudge = (id: FilmId, event: KeyboardEvent) => {
		const step = STEPS[event.key];

		if (!step) return;

		event.preventDefault();

		const far = event.shiftKey ? 30 : 10;

		onMove(
			id,
			(spots[id]?.x ?? 0) + step[0] * far,
			(spots[id]?.y ?? 0) + step[1] * far,
		);
	};

	return lineup.map((id, i) => (
		<button
			type="button"
			key={id}
			className="dd-handle"
			aria-label={`Move ${filmed(id).name}. Arrow keys work too.`}
			style={{
				left: `${places[i] * 100}%`,
				translate: `calc(-50% + ${spots[id]?.x ?? 0}px) ${spots[id]?.y ?? 0}px`,
			}}
			onPointerDown={(event) => hold(id, event)}
			onPointerMove={drag}
			onPointerUp={drop}
			onPointerCancel={drop}
			onDoubleClick={() => onHome(id)}
			onKeyDown={(event) => nudge(id, event)}
		/>
	));
}
