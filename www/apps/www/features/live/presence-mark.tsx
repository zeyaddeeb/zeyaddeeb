"use client";

import { usePresence } from "./presence";
import "./presence-mark.css";

const SHOWN = 8;

export function PresenceMark() {
	const { peers, status } = usePresence();
	const here = status === "online" && peers !== null ? peers : 0;
	const others = Math.max(here - 1, 0);

	const label =
		here <= 1
			? "You're the only one here"
			: `${here} people here right now, including you`;

	const slots = Array.from(
		{ length: Math.min(others, SHOWN - 1) },
		(_, i) => `slot-${i}`,
	);

	return (
		<p className="presence" data-shown={here > 0} title={here > 0 ? label : ""}>
			<span className="sr-only">{label}</span>
			<span className="presence__row" aria-hidden="true">
				<span className="presence__mark presence__mark--me" />
				{slots.map((slot) => (
					<span key={slot} className="presence__mark" />
				))}
			</span>
			<span className="presence__note" aria-hidden="true">
				{others > SHOWN - 1
					? `+${others - (SHOWN - 1)} more here`
					: others === 0
						? "just you here"
						: others === 1
							? "one other here"
							: `${others} others here`}
			</span>
		</p>
	);
}
