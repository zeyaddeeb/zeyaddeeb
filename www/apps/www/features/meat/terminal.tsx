"use client";

import { useEffect, useRef, useState } from "react";
import { lines, type Route } from "./ping";

const routes: [Route, string][] = [
	["you", "Via you"],
	["pigeon", "Via pigeon"],
	["direct", "Direct"],
];

const rows = 9;

export function Terminal() {
	const [route, setRoute] = useState<Route>("you");
	const [shown, setShown] = useState(0);
	const [armed, setArmed] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const log = lines(route);

	useEffect(() => {
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting) {
					setArmed(true);
					io.disconnect();
				}
			},
			{ threshold: 0.4 },
		);

		if (box.current) io.observe(box.current);

		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (!armed) return;

		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setShown(log.length);

			return;
		}

		if (shown >= log.length) return;

		const timer = window.setTimeout(
			() => setShown((n) => n + 1),
			shown === 0 ? 200 : 420,
		);

		return () => window.clearTimeout(timer);
	}, [armed, shown, log.length]);

	return (
		<div className="mc-ping" ref={box}>
			<fieldset className="mc-seg">
				<legend className="mc-eyebrow">Route</legend>
				{routes.map(([id, label]) => (
					<button
						key={id}
						type="button"
						aria-pressed={route === id}
						onClick={() => {
							setRoute(id);
							setShown(0);
						}}
					>
						{label}
					</button>
				))}
			</fieldset>
			<div
				className="mc-ping__screen"
				style={{ ["--rows" as string]: rows }}
				aria-live="polite"
			>
				{log.slice(0, shown).map((l) => (
					<p
						key={l.text}
						className={l.dim ? "mc-ping__line is-dim" : "mc-ping__line"}
					>
						<span className="mc-ping__cmd">{l.text}</span>
						{l.note ? <span className="mc-ping__note">{l.note}</span> : null}
					</p>
				))}
				{shown < log.length ? <span className="mc-ping__cursor" /> : null}
			</div>
		</div>
	);
}
