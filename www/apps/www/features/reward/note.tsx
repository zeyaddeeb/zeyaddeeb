"use client";

import { type ReactNode, useId, useState } from "react";

interface NoteProps {
	title: string;
	open?: boolean;
	wide?: boolean;
	children: ReactNode;
}

export function Note({ title, open = false, wide, children }: NoteProps) {
	const [expanded, setExpanded] = useState(open);
	const id = useId();

	return (
		<section
			className="rh-note"
			data-wide={wide || undefined}
			data-expanded={expanded}
		>
			<h4 className="rh-note__title">{title}</h4>
			<h4 className="rh-note__fold">
				<button
					type="button"
					className="rh-note__toggle"
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpanded((value) => !value)}
				>
					{title}
					<span className="rh-note__sign" aria-hidden="true" />
				</button>
			</h4>
			<div id={id} className="rh-note__body">
				{children}
			</div>
		</section>
	);
}
