"use client";

import { useEffect, useRef } from "react";

export const SHORTCUTS = [
	[..."invade"],
	["ArrowUp", "ArrowRight", "ArrowRight", "ArrowRight"],
];

const LONGEST = Math.max(...SHORTCUTS.map((keys) => keys.length));

const typing = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable ||
		["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const token = (key: string) =>
	key.length === 1 ? key.toLowerCase() : key.startsWith("Arrow") ? key : null;

export function heard(typed: string[], key: string) {
	const next = token(key);

	return next ? [...typed, next].slice(-LONGEST) : typed;
}

export const matched = (typed: string[]) =>
	SHORTCUTS.some(
		(keys) =>
			keys.length <= typed.length &&
			keys.every((key, i) => typed[typed.length - keys.length + i] === key),
	);

export function useShortcut(onHeard: () => void) {
	const latest = useRef(onHeard);

	useEffect(() => {
		latest.current = onHeard;
	}, [onHeard]);

	useEffect(() => {
		let typed: string[] = [];

		const listen = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
				return;

			if (typing(event.target)) return;

			typed = heard(typed, event.key);

			if (!matched(typed)) return;

			typed = [];
			latest.current();
		};

		window.addEventListener("keydown", listen);

		return () => window.removeEventListener("keydown", listen);
	}, []);
}
