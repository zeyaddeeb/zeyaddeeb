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
			className="sw-note"
			data-wide={wide || undefined}
			data-expanded={expanded}
		>
			<h4 className="sw-note__title">{title}</h4>
			<h4 className="sw-note__fold">
				<button
					type="button"
					className="sw-note__toggle"
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpanded((value) => !value)}
				>
					{title}
					<span className="sw-note__sign" aria-hidden="true" />
				</button>
			</h4>
			<div id={id} className="sw-note__body">
				{children}
			</div>
		</section>
	);
}
