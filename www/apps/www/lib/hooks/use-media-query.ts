"use client";

import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string) {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const mq = window.matchMedia(query);

			mq.addEventListener("change", onChange);

			return () => mq.removeEventListener("change", onChange);
		},
		[query],
	);

	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(query).matches,
		() => false,
	);
}
