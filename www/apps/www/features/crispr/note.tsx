"use client";

import { type ReactNode, useId, useState } from "react";

interface NoteProps {
	number: string;
	title: string;
	open?: boolean;
	children: ReactNode;
}

export function Note({ number, title, open = false, children }: NoteProps) {
	const [expanded, setExpanded] = useState(open);
	const id = useId();

	return (
		<section className="cr-note" data-expanded={expanded}>
			<p className="cr-note__number">{number}</p>
			<div>
				<h3 className="cr-note__title">{title}</h3>
				<h3 className="cr-note__fold">
					<button
						type="button"
						className="cr-note__toggle"
						aria-expanded={expanded}
						aria-controls={id}
						onClick={() => setExpanded((value) => !value)}
					>
						{title}
						<span className="cr-note__sign" aria-hidden="true" />
					</button>
				</h3>
				<div id={id} className="cr-note__body">
					{children}
				</div>
			</div>
		</section>
	);
}
