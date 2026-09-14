"use client";

import { useEffect, useRef, useState } from "react";

type Step =
	| { at: string; typed: string; wait?: number }
	| { out: string }
	| { pause: number };

const ZEN = [
	"The Zen of Python, by Tim Peters",
	"",
	"Beautiful is better than ugly.",
	"Explicit is better than implicit.",
	"Simple is better than complex.",
	"Complex is better than complicated.",
	"Flat is better than nested.",
	"Sparse is better than dense.",
	"Readability counts.",
	"Special cases aren't special enough to break the rules.",
	"Although practicality beats purity.",
	"Errors should never pass silently.",
	"Unless explicitly silenced.",
	"In the face of ambiguity, refuse the temptation to guess.",
	"There should be one-- and preferably only one --obvious way to do it.",
	"Although that way may not be obvious at first unless you're Dutch.",
	"Now is better than never.",
	"Although never is often better than *right* now.",
	"If the implementation is hard to explain, it's a bad idea.",
	"If the implementation is easy to explain, it may be a good idea.",
	"Namespaces are one honking great idea -- let's do more of those!",
];

const SESSION: Step[] = [
	{ out: "Python 2.7.18 (default, Sep 14 2026, 09:12:04)" },
	{
		out: 'Type "help", "copyright", "credits" or "license" for more information.',
	},
	{ pause: 600 },
	{ at: ">>> ", typed: "def func():" },
	{ at: "...     ", typed: "print 'hello'" },
	{ at: "... ", typed: "", wait: 500 },
	{ at: ">>> ", typed: "func()", wait: 700 },
	{ out: "hello" },
	{ at: ">>> ", typed: "import this", wait: 1200 },
	...ZEN.map((out) => ({ out })),
	{ at: ">>> ", typed: "", wait: 400 },
];

const KEY_MS = 46;
const LINE_MS = 110;

export function PythonScreen() {
	const [lines, setLines] = useState<string[]>([]);
	const [partial, setPartial] = useState("");
	const [done, setDone] = useState(false);
	const logRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let step = 0;
		let col = 0;
		let timer = 0;
		let cancelled = false;

		const next = () => {
			if (cancelled) return;
			const s = SESSION[step];
			if (!s) {
				setDone(true);
				return;
			}
			if ("pause" in s) {
				step++;
				timer = window.setTimeout(next, s.pause);
			} else if ("out" in s) {
				setLines((prev) => [...prev, s.out]);
				step++;
				timer = window.setTimeout(next, LINE_MS);
			} else {
				// The prompt is printed by the interpreter; only the command is typed.
				if (col === 0) {
					setPartial(s.at);
					col = -1;
					timer = window.setTimeout(next, s.wait ?? 320);
					return;
				}
				col = Math.max(0, col) + 1;
				setPartial(s.at + s.typed.slice(0, col));
				if (col >= s.typed.length) {
					const finished = s.at + s.typed;
					step++;
					col = 0;
					const last = step >= SESSION.length;
					if (!last) {
						setLines((prev) => [...prev, finished]);
						setPartial("");
					}
					timer = window.setTimeout(next, last ? 0 : 260);
				} else {
					timer = window.setTimeout(next, KEY_MS + Math.random() * 40);
				}
			}
		};
		timer = window.setTimeout(next, 400);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, []);

	useEffect(() => {
		const log = logRef.current;
		if (log) log.scrollTop = log.scrollHeight;
	}, [lines, partial]);

	return (
		<div className="shell shell--replay" data-focused={done}>
			<div
				className="shell__log"
				ref={logRef}
				role="log"
				aria-label="Python session"
			>
				{lines.map((line, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: an append-only log
					<div key={i} className="shell__line">
						{line || " "}
					</div>
				))}
				<div className="shell__line shell__prompt">
					<span>{partial}</span>
					<span className="shell__cursor" aria-hidden="true" />
				</div>
			</div>
		</div>
	);
}
