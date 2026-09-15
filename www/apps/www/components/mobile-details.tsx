"use client";

import { type ReactNode, useId, useState } from "react";
import "./mobile-details.css";

export function MobileDetails({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	const [expanded, setExpanded] = useState(false);
	const contentId = useId();

	return (
		<div className="mobile-details" data-expanded={expanded}>
			<button
				type="button"
				className="mobile-details__toggle"
				aria-expanded={expanded}
				aria-controls={contentId}
				onClick={() => setExpanded((value) => !value)}
			>
				{label}
				<span aria-hidden="true">{expanded ? "−" : "+"}</span>
			</button>
			<div id={contentId} className="mobile-details__content">
				{children}
			</div>
		</div>
	);
}
