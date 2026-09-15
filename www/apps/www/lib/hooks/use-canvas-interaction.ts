"use client";

import {
	type RefObject,
	useCallback,
	useEffect,
	useEffectEvent,
	useState,
} from "react";

export function useCanvasInteraction() {
	const [touchActive, setTouchActive] = useState(false);

	useEffect(() => {
		if (!touchActive) return;
		const exit = () => setTouchActive(false);
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") exit();
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("blur", exit);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("blur", exit);
		};
	}, [touchActive]);

	const canInteract = useCallback(
		(event: { pointerType: string }) =>
			event.pointerType === "mouse" || touchActive,
		[touchActive],
	);

	return {
		touchActive,
		setTouchActive,
		canInteract,
		touchAction: touchActive
			? ("none" as const)
			: ("pan-y pinch-zoom" as const),
	};
}

export function useCanvasWheel<T extends HTMLElement>(
	ref: RefObject<T | null>,
	onZoom: (delta: number) => void,
	enabled = true,
) {
	const zoom = useEffectEvent(onZoom);
	useEffect(() => {
		const surface = ref.current;
		if (!surface || !enabled) return;
		const onWheel = (event: WheelEvent) => {
			if ((!event.ctrlKey && !event.metaKey) || !event.cancelable) return;
			event.preventDefault();
			const unit =
				event.deltaMode === 1
					? 16
					: event.deltaMode === 2
						? surface.clientHeight
						: 1;
			zoom(event.deltaY * unit);
		};
		surface.addEventListener("wheel", onWheel, { passive: false });
		return () => surface.removeEventListener("wheel", onWheel);
	}, [ref, enabled]);
}
