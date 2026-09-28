"use client";

import { LifeArrow } from "@zeyaddeeb/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";

export interface Page {
	slug: string;
	title: string;
	finding: string;
	art: ReactNode;
	body: ReactNode;
}

const nn = (i: number) => String(i + 1).padStart(2, "0");

export function Book({ pages }: { pages: Page[] }) {
	const [open, setOpen] = useState<number | null>(null);
	const sheet = useRef<HTMLDialogElement>(null);

	const show = (i: number | null) => {
		setOpen(i);
		const { pathname, search } = window.location;
		const hash = i === null ? "" : `#${pages[i].slug}`;
		window.history.replaceState(
			window.history.state,
			"",
			`${pathname}${search}${hash}`,
		);
	};

	useEffect(() => {
		const i = pages.findIndex((p) => `#${p.slug}` === window.location.hash);
		if (i >= 0) setOpen(i);
	}, [pages]);

	useEffect(() => {
		const d = sheet.current;
		if (!d) return;
		if (open === null) {
			if (d.open) d.close();
			return;
		}
		if (!d.open) d.showModal();
		d.scrollTo({ top: 0 });
	}, [open]);

	useEffect(() => {
		const d = sheet.current;
		if (!d) return;
		const closed = () => {
			setOpen(null);
			const { pathname, search } = window.location;
			window.history.replaceState(
				window.history.state,
				"",
				`${pathname}${search}`,
			);
		};
		const backdrop = (e: MouseEvent) => {
			if (e.target === d) d.close();
		};
		d.addEventListener("close", closed);
		d.addEventListener("click", backdrop);
		return () => {
			d.removeEventListener("close", closed);
			d.removeEventListener("click", backdrop);
		};
	}, []);

	const page = open === null ? null : pages[open];

	return (
		<>
			<ol className="mc-cards">
				{pages.map((p, i) => (
					<li key={p.slug} data-n={(i + 1) % 3}>
						<button
							type="button"
							className="mc-card"
							aria-haspopup="dialog"
							onClick={() => show(i)}
						>
							<span className="mc-card__n">{nn(i)}</span>
							<span className="mc-card__art">{p.art}</span>
							<span className="mc-card__words">
								<span className="mc-card__title">{p.title}</span>
								<span className="mc-card__finding">{p.finding}</span>
							</span>
							<span className="mc-card__open" aria-hidden="true">
								<LifeArrow direction="up-right" />
							</span>
						</button>
					</li>
				))}
			</ol>
			<dialog
				ref={sheet}
				className="mc-sheet"
				aria-labelledby="mc-sheet-title"
				data-n={open === null ? undefined : (open + 1) % 3}
			>
				{page && open !== null ? (
					<>
						<header className="mc-sheet__head">
							<span className="mc-sheet__n">{nn(open)}</span>
							<div className="mc-sheet__words">
								<h2 id="mc-sheet-title">{page.title}</h2>
								<p>{page.finding}</p>
							</div>
							<button
								type="button"
								className="mc-sheet__close"
								aria-label="Close"
								onClick={() => show(null)}
							>
								<svg viewBox="0 0 20 20" aria-hidden="true">
									<path d="M3 3 L17 17 M17 3 L3 17" />
								</svg>
							</button>
						</header>
						<div className="mc-sheet__body" key={page.slug}>
							{page.body}
						</div>
						<nav className="mc-sheet__nav" aria-label="Pages">
							{open > 0 ? (
								<button type="button" onClick={() => show(open - 1)}>
									<span className="mc-eyebrow">
										<LifeArrow direction="left" /> {nn(open - 1)}
									</span>
									<span className="mc-sheet__to">{pages[open - 1].title}</span>
								</button>
							) : (
								<span />
							)}
							{open < pages.length - 1 ? (
								<button
									type="button"
									className="is-next"
									onClick={() => show(open + 1)}
								>
									<span className="mc-eyebrow">
										{nn(open + 1)} <LifeArrow direction="right" />
									</span>
									<span className="mc-sheet__to">{pages[open + 1].title}</span>
								</button>
							) : (
								<button
									type="button"
									className="is-next"
									onClick={() => show(null)}
								>
									<span className="mc-eyebrow">
										Close <LifeArrow direction="down" />
									</span>
									<span className="mc-sheet__to">Back to the answer</span>
								</button>
							)}
						</nav>
					</>
				) : null}
			</dialog>
		</>
	);
}
