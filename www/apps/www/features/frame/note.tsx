"use client";

import { type ReactNode, useId, useState } from "react";

interface NoteProps {
	title: string;
	open?: boolean;
	wide?: boolean;
	level?: 3 | 4;
	children: ReactNode;
}

export function Note({
	title,
	open = false,
	wide,
	level = 3,
	children,
}: NoteProps) {
	const [expanded, setExpanded] = useState(open);
	const id = useId();
	const Heading = `h${level}` as const;

	return (
		<section
			className="notes-card"
			data-wide={wide || undefined}
			data-expanded={expanded}
		>
			<Heading className="notes-card__title">{title}</Heading>
			<Heading className="notes-card__fold">
				<button
					type="button"
					className="notes-card__toggle"
					aria-expanded={expanded}
					aria-controls={id}
					onClick={() => setExpanded((value) => !value)}
				>
					{title}
					<span className="notes-card__sign" aria-hidden="true" />
				</button>
			</Heading>
			<div id={id} className="notes-card__body">
				{children}
			</div>
		</section>
	);
}
