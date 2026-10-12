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
			className="dd-note"
			data-wide={wide || undefined}
			data-expanded={expanded}
		>
			<h3 className="dd-note__title">{title}</h3>
			<h3 className="dd-note__fold">
				<button
					type="button"
					className="dd-note__toggle"
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpanded((value) => !value)}
				>
					{title}
					<span className="dd-note__sign" aria-hidden="true" />
				</button>
			</h3>
			<div id={id} className="dd-note__body">
				{children}
			</div>
		</section>
	);
}
