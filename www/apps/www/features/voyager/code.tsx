"use client";

import {
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { source } from "./source-data";
import "./code.css";

const KEYWORDS = new Set([
	"fn",
	"pub",
	"let",
	"mut",
	"if",
	"else",
	"return",
	"for",
	"in",
	"while",
	"match",
	"impl",
	"struct",
	"const",
	"self",
	"Self",
	"as",
	"true",
	"false",
]);

const PRIMITIVES = new Set([
	"u8",
	"u16",
	"u32",
	"usize",
	"f64",
	"bool",
	"String",
	"Vec",
	"Result",
	"Ok",
	"Err",
]);

const TOKEN =
	/(\s+)|("(?:[^"\\]|\\.)*")|(\b0x[0-9A-Fa-f_]+\b|\b\d[\d_]*(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*!?)|(.)/g;

const PHONE = "(max-width: 760px)";

function paint(line: string): ReactNode[] {
	const out: ReactNode[] = [];
	let k = 0;
	let prev = "";
	for (const m of line.matchAll(TOKEN)) {
		const [text, space, str, num, word] = m;
		let cls: string | undefined;
		if (space) cls = undefined;
		else if (str) cls = "s";
		else if (num) cls = "n";
		else if (word) {
			if (KEYWORDS.has(word)) cls = "k";
			else if (word.endsWith("!")) cls = "m";
			else if (PRIMITIVES.has(word) || /^[A-Z][a-z]/.test(word)) cls = "t";
			else if (/^[A-Z_0-9]+$/.test(word)) cls = "c";
			else if (prev === "fn") cls = "f";
		}
		if (!space) prev = word ?? text;
		out.push(
			cls ? (
				<span key={k++} className={`vg-tok-${cls}`}>
					{text}
				</span>
			) : (
				text
			),
		);
	}
	return out;
}

interface Line {
	text: string;
	indent: number;
	tokens: ReactNode[];
}

interface Block {
	name: string;
	line: number;
	lines: Line[];
}

interface Hot {
	name: string;
	index: number;
}

function room(blocks: Block[], label: string) {
	const need =
		150 + (label.length + blocks.reduce((n, b) => n + b.name.length, 0)) * 7.3;
	const tabs = blocks.length * 20;
	const w = need + tabs;
	return w <= 440 ? "s" : w <= 500 ? "m" : w <= 560 ? "l" : "xl";
}

function CodeIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M5.5 4 1.75 8l3.75 4M10.5 4l3.75 4-3.75 4M9.25 2.5l-2.5 11" />
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg viewBox="0 0 16 16" aria-hidden="true">
			<path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
		</svg>
	);
}

function Panel({
	blocks,
	shown,
	hotAt,
	label,
	uid,
	swap,
	onPick,
}: {
	blocks: Block[];
	shown: string;
	hotAt: Hot | null;
	label: string;
	uid: string;
	swap: "cut" | "fade";
	onPick: (name: string) => void;
}) {
	const tabs = useRef<HTMLDivElement>(null);

	const key = (e: KeyboardEvent<HTMLDivElement>) => {
		const at = blocks.findIndex((b) => b.name === shown);
		let next = at;
		if (e.key === "ArrowRight") next = (at + 1) % blocks.length;
		else if (e.key === "ArrowLeft")
			next = (at - 1 + blocks.length) % blocks.length;
		else if (e.key === "Home") next = 0;
		else if (e.key === "End") next = blocks.length - 1;
		else return;
		e.preventDefault();
		onPick(blocks[next].name);
		tabs.current
			?.querySelectorAll<HTMLButtonElement>("[role='tab']")
			[next]?.focus();
	};

	return (
		<figure
			className="vg-code"
			aria-label="Rust source from voyager.rs"
			data-room={room(blocks, label)}
			data-swap={swap}
		>
			<div className="vg-code__bar">
				<span className="vg-code__file">voyager.rs</span>
				<div
					ref={tabs}
					className="vg-code__tabs"
					role="tablist"
					aria-label="Functions"
					onKeyDown={key}
				>
					{blocks.map((b) => {
						const on = b.name === shown;
						return (
							<button
								key={b.name}
								type="button"
								role="tab"
								id={`${uid}-tab-${b.name}`}
								className="vg-code__tab"
								aria-selected={on}
								aria-controls={`${uid}-fn-${b.name}`}
								tabIndex={on ? 0 : -1}
								onClick={() => onPick(b.name)}
							>
								{b.name}
							</button>
						);
					})}
				</div>
				<span className="vg-code__run">
					<i className="vg-code__dot" />
					<span className="vg-code__label">{label}</span>
				</span>
			</div>
			<div className="vg-code__body">
				<div className="vg-code__stack">
					{blocks.map((b) => {
						const on = b.name === shown;
						return (
							<pre
								key={b.name}
								id={`${uid}-fn-${b.name}`}
								className="vg-code__fn"
								role="tabpanel"
								aria-labelledby={`${uid}-tab-${b.name}`}
								data-on={on ? "true" : undefined}
							>
								<code>
									{b.lines.map((l, i) => (
										<span
											key={`${b.name}-${b.line + i}`}
											className="vg-code__line"
											data-hot={
												hotAt?.name === b.name && hotAt.index === i
													? "true"
													: undefined
											}
										>
											<span className="vg-code__n">{b.line + i}</span>
											<span
												className="vg-code__text"
												style={{ "--i": l.indent } as CSSProperties}
											>
												{l.tokens}
											</span>
										</span>
									))}
								</code>
							</pre>
						);
					})}
				</div>
			</div>
		</figure>
	);
}

export function Code({
	names,
	hot,
	beat = 0,
	label,
	title,
	className,
}: {
	names: string[];
	hot?: string | null;
	beat?: number;
	label?: string;
	title?: string;
	className?: string;
}) {
	const uid = useId();
	const root = useRef<HTMLDivElement>(null);
	const sheet = useRef<HTMLDialogElement>(null);
	const strip = useRef<HTMLButtonElement>(null);
	const seen = useRef(beat);
	const [open, setOpen] = useState(false);
	const [pin, setPin] = useState<{ tab: string; at: string | null } | null>(
		null,
	);

	const key = names.join(" ");
	const blocks = useMemo<Block[]>(
		() =>
			key.split(" ").map((name) => {
				const { line, code } = source[name];
				return {
					name,
					line,
					lines: code.split("\n").map((text) => ({
						text,
						indent: text.length - text.trimStart().length,
						tokens: paint(text),
					})),
				};
			}),
		[key],
	);

	const hotAt = useMemo<Hot | null>(() => {
		if (!hot) return null;
		for (const b of blocks) {
			const index = b.lines.findIndex((l) => l.text.includes(hot));
			if (index >= 0) return { name: b.name, index };
		}
		return null;
	}, [blocks, hot]);

	const running = hotAt?.name ?? null;
	const pinned = pin && (running === null || pin.at === running);
	const shown = pinned ? pin.tab : (running ?? blocks[0].name);
	const live = blocks.find((b) => b.name === (running ?? shown)) ?? blocks[0];
	const liveLine =
		live.lines[hotAt && hotAt.name === live.name ? hotAt.index : 0].text;

	useEffect(() => {
		setPin((p) => (p && running !== null && p.at !== running ? null : p));
	}, [running]);

	useEffect(() => {
		if (beat === seen.current) return;
		seen.current = beat;
		const el = root.current;
		if (!el) return;
		const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		for (const line of el.querySelectorAll<HTMLElement>(
			".vg-code__fn[data-on] .vg-code__line[data-hot]",
		)) {
			if (!still)
				line.animate(
					[
						{ backgroundColor: "rgba(232, 179, 85, 0.4)" },
						{ backgroundColor: "rgba(232, 179, 85, 0.14)" },
					],
					{ duration: 600, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
				);
			const body = line.closest<HTMLElement>(".vg-code__body");
			if (!body || body.scrollHeight <= body.clientHeight + 1) continue;
			const top = line.offsetTop;
			const bottom = top + line.offsetHeight;
			if (top < body.scrollTop || bottom > body.scrollTop + body.clientHeight)
				body.scrollTo({ top: Math.max(0, top - body.clientHeight / 3) });
		}
		if (still) return;
		for (const dot of el.querySelectorAll<HTMLElement>(".vg-code__dot")) {
			dot.animate(
				[{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0.4 }],
				{ duration: 200 },
			);
		}
	}, [beat]);

	useEffect(() => {
		const d = sheet.current;
		if (!d) return;
		const phone = window.matchMedia(PHONE);
		const closed = () => {
			setOpen(false);
			strip.current?.focus();
		};
		const click = (e: MouseEvent) => {
			if (e.target === d) d.close();
		};
		const change = () => {
			if (!phone.matches && d.open) d.close();
		};
		d.addEventListener("close", closed);
		d.addEventListener("click", click);
		phone.addEventListener("change", change);
		return () => {
			d.removeEventListener("close", closed);
			d.removeEventListener("click", click);
			phone.removeEventListener("change", change);
		};
	}, []);

	const pick = (tab: string) => setPin({ tab, at: running });

	const show = () => {
		const d = sheet.current;
		if (!d || d.open) return;
		setOpen(true);
		d.showModal();
	};

	const panel = (prefix: string) => (
		<Panel
			blocks={blocks}
			shown={shown}
			hotAt={hotAt}
			label={label ?? "Running in WebAssembly"}
			uid={prefix}
			swap={pinned ? "cut" : "fade"}
			onPick={pick}
		/>
	);

	return (
		<div ref={root} className={className ? `vg-rust ${className}` : "vg-rust"}>
			{panel(uid)}
			<button
				ref={strip}
				type="button"
				className="vg-strip"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label={`Show the Rust: ${live.name}, from voyager.rs`}
				onClick={show}
			>
				<i className="vg-code__dot" />
				<span className="vg-strip__code" aria-hidden="true">
					<span className="vg-strip__fn">{live.name}()</span>
					<span className="vg-strip__line">{liveLine.trim()}</span>
				</span>
				<span className="vg-strip__cta" aria-hidden="true">
					<CodeIcon />
					Rust
				</span>
			</button>
			<dialog
				ref={sheet}
				className="vg-codesheet"
				aria-labelledby={`${uid}-title`}
			>
				<div className="vg-codesheet__head">
					<div>
						<p className="vg-eyebrow">voyager.rs</p>
						<h2 id={`${uid}-title`} className="vg-codesheet__title">
							{title ?? "The Rust running on this page"}
						</h2>
					</div>
					<button
						type="button"
						className="vg-icon-button"
						aria-label="Close"
						onClick={() => sheet.current?.close()}
					>
						<CloseIcon />
					</button>
				</div>
				{open ? panel(`${uid}s`) : null}
			</dialog>
		</div>
	);
}
