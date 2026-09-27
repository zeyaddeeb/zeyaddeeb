"use client";

import { type ChangeEvent, type SyntheticEvent, useRef } from "react";
import type { LaneId, Problem } from "./score";

interface Token {
	text: string;
	start: number;
	word: boolean;
}

export function tokenize(code: string): Token[] {
	const out: Token[] = [];
	const pattern = /([A-Za-z0-9#.'-]+(?:>[A-Ga-g][A-Za-z0-9#.'-]*)*)|(\s+)|(.)/g;
	for (const match of code.matchAll(pattern)) {
		out.push({
			text: match[0],
			start: match.index ?? 0,
			word: match[1] !== undefined,
		});
	}
	return out;
}

export function wordAt(code: string, caret: number): [number, number] | null {
	for (const token of tokenize(code))
		if (
			token.word &&
			caret >= token.start &&
			caret <= token.start + token.text.length
		)
			return [token.start, token.start + token.text.length];
	return null;
}

interface CodeLineProps {
	lane: LaneId;
	code: string;
	problem: Problem | null;
	muted: boolean;
	selected: number | null;
	onChange: (code: string) => void;
	onCaret: (at: number) => void;
}

export function CodeLine({
	lane,
	code,
	problem,
	muted,
	selected,
	onChange,
	onCaret,
}: CodeLineProps) {
	const mirror = useRef<HTMLDivElement>(null);
	const sync = (event: SyntheticEvent<HTMLInputElement>) => {
		if (mirror.current)
			mirror.current.style.transform = `translateX(${-event.currentTarget.scrollLeft}px)`;
	};
	const caret = (event: SyntheticEvent<HTMLInputElement>) => {
		sync(event);
		const at = event.currentTarget.selectionStart;
		if (at !== null) onCaret(at);
	};
	const bad = problem ? problem.at : null;
	return (
		<div
			className="jz-code"
			data-muted={muted || undefined}
			data-problem={problem ? true : undefined}
		>
			<span className="jz-code-edge" aria-hidden="true">
				{muted ? "// " : ""}"
			</span>
			<div className="jz-code-field">
				<div className="jz-code-mirror" ref={mirror} aria-hidden="true">
					{tokenize(code).map((token) => (
						<span
							key={token.start}
							data-token={token.word ? `${lane}:${token.start}` : undefined}
							data-selected={
								token.word && selected === token.start ? true : undefined
							}
							data-bad={
								bad !== null &&
								bad >= token.start &&
								bad < token.start + Math.max(1, token.text.length)
									? true
									: undefined
							}
						>
							{token.text}
						</span>
					))}
					{bad !== null && bad >= code.length ? (
						<span data-bad="true"> </span>
					) : null}
					<span className="jz-code-edge">"</span>
				</div>
				<input
					value={code}
					aria-label={`${lane} pattern`}
					spellCheck={false}
					autoCapitalize="off"
					autoCorrect="off"
					autoComplete="off"
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onChange(event.currentTarget.value)
					}
					onScroll={sync}
					onSelect={caret}
				/>
			</div>
		</div>
	);
}
