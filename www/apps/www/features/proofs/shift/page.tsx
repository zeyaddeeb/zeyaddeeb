"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { caption } from "./caption";
import { Exhibit } from "./exhibit";
import { chip, words } from "./format";
import type { SearchStep } from "./protocol";
import type { TurnView } from "./reduce";
import { steps, thinking } from "./steps";

export interface PageView {
	live: boolean;
	title: string;
	question: string;
	objective: string | null;
	prediction: string | null;
	turns: TurnView[];
	search: SearchStep[];
	status: string;
}

export function NotebookPage({
	view,
	pager,
}: {
	view: PageView;
	pager: ReactNode;
}) {
	const [picked, setPicked] = useState<string | null>(null);
	const [reading, setReading] = useState(false);
	const all = steps(view.turns);
	const pending = view.live ? thinking(view.turns) : null;
	const chosen = all.find((s) => s.id === picked) ?? all.at(-1) ?? null;
	const following = picked === null && pending;
	const turn = following
		? pending
		: view.turns.find((t) => t.index === chosen?.turn);
	const thought = (turn?.think.trim() || turn?.say.trim()) ?? "";
	const lines = caption(thought);
	const streaming = !!following;
	const strip = useRef<HTMLOListElement>(null);
	const chips = all.length + (pending ? 1 : 0);

	useLayoutEffect(() => {
		const element = strip.current;
		if (element && chips) element.scrollLeft = element.scrollWidth;
	}, [chips]);

	return (
		<section
			className="ns-page"
			data-live={view.live || undefined}
			aria-label={view.title}
		>
			<header className="ns-page-head">
				<p className="ns-eyebrow">{view.title}</p>
				{pager}
			</header>
			<h3 className="ns-question">{view.question}</h3>
			<dl className="ns-plan" data-empty={!view.objective || undefined}>
				<div>
					<dt>Objective</dt>
					<dd>{view.objective ?? "—"}</dd>
				</div>
				<div>
					<dt>Predicts</dt>
					<dd>{view.prediction ?? "—"}</dd>
				</div>
			</dl>
			<div className="ns-caption" data-streaming={streaming || undefined}>
				{lines ? (
					<>
						<p className="ns-caption-before">{lines.before ?? " "}</p>
						<p className="ns-caption-now">{lines.now}</p>
					</>
				) : (
					<p className="ns-caption-now" data-empty>
						{view.live
							? "Quiet for the moment."
							: "No thoughts were kept for this step."}
					</p>
				)}
				{thought && !(lines?.whole && !streaming) ? (
					<button
						type="button"
						className="ns-read"
						aria-expanded={reading}
						onClick={() => setReading((r) => !r)}
					>
						{reading
							? "Close"
							: `Read the whole thought · ${words(thought)} words`}
					</button>
				) : null}
			</div>
			<ol className="ns-steps" ref={strip} aria-label="Steps in this episode">
				{all.map((step) => (
					<li key={step.id}>
						<button
							type="button"
							className="ns-step"
							data-status={step.status}
							aria-pressed={chosen?.id === step.id && !following}
							onClick={() => {
								setPicked(step.id);
								setReading(false);
							}}
						>
							{chip(step.tool, step.args)}
						</button>
					</li>
				))}
				{pending ? (
					<li>
						<button
							type="button"
							className="ns-step"
							data-status="thinking"
							aria-pressed={!!following}
							onClick={() => setPicked(null)}
						>
							Thinking
						</button>
					</li>
				) : null}
			</ol>
			<div className="ns-page-body">
				<Exhibit step={chosen} search={view.search} />
				{reading ? (
					<div className="ns-reading">
						<p>{thought}</p>
					</div>
				) : null}
			</div>
			<p className="ns-activity" aria-live="polite">
				{view.status}
			</p>
		</section>
	);
}
