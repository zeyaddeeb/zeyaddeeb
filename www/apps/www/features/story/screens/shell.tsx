"use client";

import { useEffect, useRef, useState } from "react";

export interface ShellResult {
	lines?: string[];
	clear?: boolean;
	prompt?: string;
	launch?: string;
}

interface ShellProps {
	prompt: string;
	banner?: string[];
	run: (input: string) => ShellResult;
	onLaunch?: (program: string) => void;
	label: string;
	idle?: string;
}

export function Shell({
	prompt: initialPrompt,
	banner = [],
	run,
	onLaunch,
	label,
	idle = "click to type",
}: ShellProps) {
	const [lines, setLines] = useState<string[]>(banner);
	const [prompt, setPrompt] = useState(initialPrompt);
	const [value, setValue] = useState("");
	const [focused, setFocused] = useState(false);
	const history = useRef<string[]>([]);
	const cursor = useRef(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const logRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const log = logRef.current;
		if (log) log.scrollTop = log.scrollHeight;
	}, [lines, value]);

	const submit = () => {
		const input = value;
		setValue("");
		if (input.trim()) {
			history.current.push(input);
		}
		cursor.current = history.current.length;
		const result = run(input);
		setLines((prev) => {
			const base = result.clear ? [] : [...prev, `${prompt}${input}`];
			return [...base, ...(result.lines ?? [])].slice(-400);
		});
		if (result.prompt !== undefined) setPrompt(result.prompt);
		if (result.launch) onLaunch?.(result.launch);
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			submit();
		} else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
			e.preventDefault();
			const h = history.current;
			if (!h.length) return;
			cursor.current =
				e.key === "ArrowUp"
					? Math.max(0, cursor.current - 1)
					: Math.min(h.length, cursor.current + 1);
			setValue(h[cursor.current] ?? "");
		}
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the click only moves focus to the input inside
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users tab straight to the input
		<div
			className="shell"
			data-focused={focused}
			onClick={() => inputRef.current?.focus()}
		>
			<div className="shell__log" ref={logRef} role="log" aria-label={label}>
				{lines.map((line, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: an append-only log
					<div key={i} className="shell__line">
						{line || " "}
					</div>
				))}
				<div className="shell__line shell__prompt">
					<span>{prompt}</span>
					<span>{value}</span>
					<span className="shell__cursor" aria-hidden="true" />
					{!focused && !value ? (
						<span className="shell__idle" aria-hidden="true">
							{idle}
						</span>
					) : null}
				</div>
			</div>
			<input
				ref={inputRef}
				className="shell__input"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={onKeyDown}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				aria-label={`${label} command line`}
				autoCapitalize="off"
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
			/>
		</div>
	);
}
