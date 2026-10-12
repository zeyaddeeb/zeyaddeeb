"use client";

import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { Glyph, type GlyphName } from "./glyph";

interface WindowProps {
	title: string;
	icon: GlyphName;
	shown: boolean;
	onHide: () => void;
	onClose: () => void;
	children: ReactNode;
}

export function XpWindow({
	title,
	icon,
	shown,
	onHide,
	onClose,
	children,
}: WindowProps) {
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const grip = useRef<{ x: number; y: number; id: number } | null>(null);
	const frame = useRef<HTMLElement>(null);

	const grab = (event: PointerEvent<HTMLElement>) => {
		if (event.pointerType === "touch") return;

		if ((event.target as HTMLElement).closest("button")) return;

		grip.current = {
			x: event.clientX - offset.x,
			y: event.clientY - offset.y,
			id: event.pointerId,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const drag = (event: PointerEvent<HTMLElement>) => {
		const held = grip.current;
		const box = frame.current;
		const room = box?.parentElement;

		if (!held || held.id !== event.pointerId || !box || !room) return;

		const limit = (value: number, low: number, high: number) =>
			Math.min(Math.max(value, low), Math.max(low, high));

		setOffset({
			x: limit(
				event.clientX - held.x,
				-box.offsetLeft,
				room.clientWidth - box.offsetLeft - box.offsetWidth,
			),
			y: limit(
				event.clientY - held.y,
				-box.offsetTop,
				room.clientHeight - box.offsetTop - 60,
			),
		});
	};

	const drop = () => {
		grip.current = null;
	};

	return (
		<section
			ref={frame}
			className="dd-window"
			aria-label={title}
			hidden={!shown}
			style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
		>
			<header
				className="dd-window__bar"
				onPointerDown={grab}
				onPointerMove={drag}
				onPointerUp={drop}
				onPointerCancel={drop}
			>
				<span className="dd-window__icon">
					<Glyph name={icon} size={14} />
				</span>
				<h2 className="dd-window__title">{title}</h2>
				<button
					type="button"
					className="dd-window__button"
					aria-label={`Minimize ${title}`}
					onClick={onHide}
				>
					<Glyph name="hide" size={12} />
				</button>
				<button
					type="button"
					className="dd-window__button"
					data-kind="close"
					aria-label={`Close ${title}`}
					onClick={onClose}
				>
					<Glyph name="close" size={12} />
				</button>
			</header>
			<div className="dd-window__body">{children}</div>
		</section>
	);
}
