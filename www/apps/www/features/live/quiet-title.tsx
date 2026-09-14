"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "./presence";
import { useRunningCount } from "./running-context";

const SITE = "Zeyad Deeb";

export function QuietTitle() {
	const { peers, status } = usePresence();
	const running = useRunningCount();
	const realTitle = useRef<string | null>(null);
	const writing = useRef(false);

	const others =
		status === "online" && peers !== null ? Math.max(peers - 1, 0) : 0;
	const away = useRef({ others, running });
	away.current = { others, running };

	useEffect(() => {
		const el = document.querySelector("title");
		if (!el) return;
		realTitle.current = document.title;

		const observer = new MutationObserver(() => {
			if (!writing.current) realTitle.current = document.title;
		});
		observer.observe(el, { childList: true });

		const write = (value: string) => {
			writing.current = true;
			document.title = value;
			queueMicrotask(() => {
				writing.current = false;
			});
		};

		const line = () => {
			const { others: o, running: r } = away.current;
			if (o === 1) return `One other here · ${SITE}`;
			if (o > 1) return `${o} others here · ${SITE}`;
			if (r === 1) return `One thing still running · ${SITE}`;
			if (r > 1) return `${r} things still running · ${SITE}`;
			return null;
		};

		const update = () => {
			if (document.visibilityState === "hidden") {
				const next = line();
				if (next) write(next);
			} else if (realTitle.current !== null) {
				write(realTitle.current);
			}
		};

		document.addEventListener("visibilitychange", update);
		return () => {
			observer.disconnect();
			document.removeEventListener("visibilitychange", update);
			if (realTitle.current !== null) document.title = realTitle.current;
		};
	}, []);

	return null;
}
