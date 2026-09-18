"use client";

import { type KeyboardEvent, type PointerEvent, useState } from "react";

export function useScrub(count: number, layout: "cells" | "points") {
	const [raw, setRaw] = useState<number | null>(null);
	const index = raw !== null && raw < count ? raw : null;
	const clamp = (value: number) => Math.min(count - 1, Math.max(0, value));
	const at = (event: PointerEvent<HTMLElement>) => {
		const box = event.currentTarget.getBoundingClientRect();
		const ratio = (event.clientX - box.left) / Math.max(box.width, 1);
		return clamp(
			layout === "cells"
				? Math.floor(ratio * count)
				: Math.round(ratio * (count - 1)),
		);
	};
	const read = (event: PointerEvent<HTMLElement>) => {
		if (count > 0) setRaw(at(event));
	};
	return {
		index,
		handlers: {
			onPointerDown: read,
			onPointerMove: read,
			onPointerLeave: (event: PointerEvent<HTMLElement>) => {
				if (event.pointerType === "mouse") setRaw(null);
			},
			onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
				if (count === 0) return;
				const from = index ?? (event.key === "ArrowLeft" ? count : -1);
				let next: number;
				if (event.key === "ArrowLeft") next = from - 1;
				else if (event.key === "ArrowRight") next = from + 1;
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = count - 1;
				else if (event.key === "Escape" && index !== null) {
					setRaw(null);
					event.stopPropagation();
					return;
				} else return;
				event.preventDefault();
				event.stopPropagation();
				setRaw(clamp(next));
			},
		},
	};
}
