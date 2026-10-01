"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { answer, ownWords, paste, trim } from "./answer";
import {
	deflated,
	jargon,
	percent,
	readSeconds,
	scale,
	span,
	words,
} from "./meat";
import { Strip } from "./strip";

const weigh = scale(answer);
const answerWords = words(answer).length;
const base = `${answer}\n`;

const keys = "asdfjkl;ghqweruiop";

function mash() {
	const out: string[] = [];

	for (let i = 0; i < 36; i++) {
		const n = 2 + Math.floor(Math.random() * 6);
		let w = "";

		for (let j = 0; j < n; j++)
			w += keys[Math.floor(Math.random() * keys.length)];

		out.push(w);
	}

	return out.join(" ");
}

const presets = [
	{ id: "paste", label: "Paste it all", text: () => paste },
	{ id: "trim", label: "Paste the TL;DR", text: () => trim },
	{ id: "own", label: "Own words", text: () => ownWords },
	{ id: "mash", label: "Mash keys", text: mash },
] as const;

function useGzip(reply: string) {
	const [bytes, setBytes] = useState<number | null>(null);
	const baseSize = useRef<Promise<number | null> | null>(null);

	useEffect(() => {
		let live = true;

		const timer = window.setTimeout(async () => {
			baseSize.current ??= deflated(base);

			const [a, b] = await Promise.all([
				baseSize.current,
				deflated(base + reply),
			]);

			if (live) setBytes(a === null || b === null ? null : b - a);
		}, 120);

		return () => {
			live = false;
			window.clearTimeout(timer);
		};
	}, [reply]);

	return bytes;
}

export function Weigh() {
	const [reply, setReply] = useState<string>(paste);
	const [preset, setPreset] = useState<string | null>("paste");
	const mirror = useRef<HTMLDivElement>(null);
	const w = useMemo(() => weigh(reply), [reply]);
	const bytes = useGzip(reply);
	const terms = useMemo(() => jargon(reply), [reply]);

	return (
		<div className="mc-weigh">
			<Strip />
			<div className="mc-thread">
				<div className="mc-tab">
					<div className="mc-tab__head">
						<span className="mc-eyebrow">Claude, in your other tab</span>
						<span className="mc-eyebrow">
							{answerWords} words · {span(readSeconds(answerWords))} to read
						</span>
					</div>
					<pre className="mc-tab__body">{answer}</pre>
				</div>
				<div className="mc-reply">
					<div className="mc-reply__row">
						<p className="mc-eyebrow">Your reply</p>
						<div className="mc-presets">
							{presets.map((p) => (
								<button
									key={p.id}
									type="button"
									aria-pressed={preset === p.id}
									onClick={() => {
										setReply(p.text());
										setPreset(p.id);

										if (mirror.current) mirror.current.scrollTop = 0;
									}}
								>
									{p.label}
								</button>
							))}
						</div>
					</div>
					<div className="mc-editor">
						<div className="mc-editor__mirror" ref={mirror} aria-hidden="true">
							{w.pieces.map((p, i) =>
								p.word ? (
									<span key={i} className={p.mine ? "is-mine" : undefined}>
										{p.text}
									</span>
								) : (
									p.text
								),
							)}
							{"\n"}
						</div>
						<textarea
							value={reply}
							spellCheck={false}
							aria-label="Your reply"
							placeholder="Write a reply…"
							onChange={(e) => {
								setReply(e.target.value);
								setPreset(null);
							}}
							onScroll={(e) => {
								if (mirror.current)
									mirror.current.scrollTop = e.currentTarget.scrollTop;
							}}
						/>
					</div>
				</div>
			</div>

			<section className="mc-label" aria-label="Meat Facts" aria-live="polite">
				<h3 className="mc-label__title">Meat Facts</h3>
				<p className="mc-label__serving">
					1 reply, {w.words.toLocaleString("en-US")} words
				</p>
				<hr className="mc-label__rule mc-label__rule--heavy" />
				<dl className="mc-label__rows">
					<div>
						<dt>Words by you</dt>
						<dd>{w.mine.toLocaleString("en-US")}</dd>
					</div>
					<div>
						<dt>Words by Claude</dt>
						<dd>{(w.words - w.mine).toLocaleString("en-US")}</dd>
					</div>
				</dl>
				<hr className="mc-label__rule mc-label__rule--mid" />
				<div className="mc-label__big">
					<span>Meat content</span>
					<b>{w.words ? percent(w.share) : "—"}</b>
				</div>
				<div className="mc-label__bar" aria-hidden="true">
					<span style={{ transform: `scaleX(${w.share})` }} />
				</div>
				<hr className="mc-label__rule" />
				<dl className="mc-label__rows">
					<div>
						<dt>New to gzip</dt>
						<dd>{bytes === null ? "—" : `+${Math.max(0, bytes)} bytes`}</dd>
					</div>
					<div>
						<dt>Reading time, each reader</dt>
						<dd>{span(readSeconds(w.words))}</dd>
					</div>
					<div>
						<dt>Jargon terms</dt>
						<dd>{terms}</dd>
					</div>
					<div>
						<dt>Checked by sender</dt>
						<dd>can’t tell</dd>
					</div>
				</dl>
				<hr className="mc-label__rule mc-label__rule--heavy" />
				<p className="mc-label__fine">
					Any run of four or more words that also appears in Claude’s answer
					counts as Claude’s. gzip reads Claude’s answer first.
				</p>
			</section>
		</div>
	);
}
