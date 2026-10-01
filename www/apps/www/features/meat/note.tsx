"use client";

import { type ReactNode, useId, useState } from "react";

export function Note({ n, children }: { n: number; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const id = useId();

	return (
		<>
			<button
				type="button"
				className="mc-fn"
				aria-expanded={open}
				aria-controls={id}
				aria-label={`Footnote ${n}`}
				onClick={() => setOpen((o) => !o)}
			>
				{n}
			</button>
			<span id={id} className="mc-fn__body" hidden={!open}>
				<span className="mc-fn__n">{n}</span>
				{children}
			</span>
		</>
	);
}
