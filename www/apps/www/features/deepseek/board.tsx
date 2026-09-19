"use client";

import { useReducedMotion } from "framer-motion";
import { type CSSProperties, useEffect, useState } from "react";
import type { DreamView, ModelInfo, ProbeView } from "./protocol";
import { useScrub } from "./scrub";

const percent = (value: number) =>
	value >= 0.995
		? "100%"
		: value < 0.01
			? "<1%"
			: `${Math.round(value * 100)}%`;

const fine = (value: number) =>
	value >= 0.1
		? `${Math.round(value * 100)}%`
		: `${(value * 100).toFixed(value >= 0.01 ? 1 : 2)}%`;

const REGIONS = ["keywords and symbols", "numbers 0 to 64"];

interface Snapshot {
	step: number;
	distribution: number[];
}

interface BetProps {
	probe: ProbeView;
	model: ModelInfo;
	selected: number;
	marked: boolean;
}

export function Bet({ probe, model, selected, marked }: BetProps) {
	const { focus, line } = probe;
	const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
	const pending = focus.position + 1 !== selected;
	const actual = selected < line.tokens.length ? line.tokens[selected] : null;
	const key = JSON.stringify([line.code, line.question, focus.position]);
	useEffect(() => {
		if (pending || !focus.distribution.length) return;
		setSnapshots((previous) =>
			previous[key]
				? previous
				: {
						...previous,
						[key]: { step: probe.step, distribution: [...focus.distribution] },
					},
		);
	}, [pending, key, probe.step, focus.distribution]);
	const baseline = snapshots[key];
	const moved = !!baseline && baseline.step !== probe.step;

	const size = focus.distribution.length;
	const expectedId = marked
		? model.vocabulary.indexOf(actual?.text ?? line.truth ?? "")
		: -1;
	const peak = Math.max(...focus.distribution, 0);
	const leaderId = focus.distribution.indexOf(peak);
	const scrub = useScrub(size, "cells");
	const readId = scrub.index ?? (expectedId >= 0 ? expectedId : leaderId);
	const read = focus.distribution[readId] ?? 0;
	const rank = focus.distribution.filter((value) => value > read).length + 1;
	const firstNumber = model.vocabulary.findIndex((word) => /^\d+$/.test(word));

	const flag = (id: number) => {
		const p = focus.distribution[id] ?? 0;
		return {
			left: `${Math.min(95, Math.max(5, ((id + 0.5) / Math.max(size, 1)) * 100))}%`,
			bottom: `${p * 100}%`,
		} as CSSProperties;
	};
	const truthP = focus.distribution[expectedId] ?? 0;
	const crowded =
		expectedId >= 0 &&
		expectedId !== leaderId &&
		Math.abs(expectedId - leaderId) < size * 0.1;

	return (
		<section
			className="ds-bet"
			aria-label="The model's bet on the next token"
			aria-busy={pending}
			data-pending={pending}
		>
			<header>
				<h3 className="ds-eyebrow">
					{actual ? "Its bet for the box" : "Its bet for the answer"}
				</h3>
				<span className="ds-bet-update">
					{pending
						? "reading…"
						: `update ${probe.step.toLocaleString("en-US")}`}
				</span>
			</header>
			<p className="ds-bet-readout" aria-hidden="true">
				<b>{model.vocabulary[readId] ?? "?"}</b>
				<span>{fine(read)}</span>
				<span>
					rank {rank} of {model.vocabSize}
				</span>
				{readId === expectedId ? (
					<span>{actual ? "what the line said" : "the correct answer"}</span>
				) : null}
				{moved ? (
					<span>
						was {fine(baseline.distribution[readId] ?? 0)} at update{" "}
						{baseline.step.toLocaleString("en-US")}
					</span>
				) : null}
				{scrub.index === null ? (
					<span className="ds-bet-how">slide across to read any bar</span>
				) : null}
			</p>
			<div className="ds-bet-plot">
				<div className="ds-bet-grid" aria-hidden="true">
					<span>100%</span>
					<span>50%</span>
				</div>
				<div
					className="ds-bet-bars"
					role="slider"
					tabIndex={0}
					aria-label={`Probability of each of the ${model.vocabSize} tokens`}
					aria-valuemin={1}
					aria-valuemax={model.vocabSize}
					aria-valuenow={readId + 1}
					aria-valuetext={`${model.vocabulary[readId] ?? "?"}, ${fine(read)}, rank ${rank}`}
					{...scrub.handlers}
				>
					{focus.distribution.map((probability, id) => (
						<span
							key={model.vocabulary[id] ?? id}
							data-on={scrub.index === id}
							data-hit={id === expectedId}
						>
							<i style={{ height: `${Math.max(0.9, probability * 100)}%` }} />
						</span>
					))}
				</div>
				{size ? (
					<span
						className="ds-bet-flag"
						data-kind={leaderId === expectedId ? "truth" : "leader"}
						style={flag(leaderId)}
						aria-hidden="true"
					>
						<b>{model.vocabulary[leaderId]}</b> {percent(peak)}
					</span>
				) : null}
				{expectedId >= 0 && expectedId !== leaderId ? (
					<span
						className="ds-bet-flag"
						data-kind="truth"
						data-lift={crowded}
						style={
							crowded
								? { ...flag(expectedId), bottom: `${peak * 100}%` }
								: flag(expectedId)
						}
						aria-hidden="true"
					>
						<b>{model.vocabulary[expectedId]}</b> {percent(truthP)}
					</span>
				) : null}
			</div>
			<p className="ds-bet-scale" aria-hidden="true">
				<span style={{ flexGrow: Math.max(firstNumber, 1) }}>{REGIONS[0]}</span>
				<span style={{ flexGrow: Math.max(model.vocabSize - firstNumber, 1) }}>
					{REGIONS[1]}
				</span>
			</p>
		</section>
	);
}

export function Choices({
	prompt,
	options,
	onPick,
}: {
	prompt: string;
	options: string[];
	onPick: (text: string) => void;
}) {
	return (
		<fieldset className="ds-choices">
			<legend>{prompt}</legend>
			<div>
				{options.map((text) => (
					<button key={text} type="button" onClick={() => onPick(text)}>
						{text}
					</button>
				))}
			</div>
		</fieldset>
	);
}

const TYPE_MS = 90;

function WriterRow({ dream, wait }: { dream: DreamView; wait: number }) {
	const still = useReducedMotion();
	const total = dream.tokens.length;
	const [shown, setShown] = useState(0);
	useEffect(() => {
		if (still) return;
		let timer = 0;
		const start = window.setTimeout(() => {
			timer = window.setInterval(
				() => setShown((n) => Math.min(total, n + 1)),
				TYPE_MS,
			);
		}, wait);
		return () => {
			window.clearTimeout(start);
			window.clearInterval(timer);
		};
	}, [still, total, wait]);
	const visible = still ? total : shown;
	const done = visible >= total;
	return (
		<li data-compiles={dream.compiles} data-done={done}>
			<span className="ds-writer-step">
				update {dream.step.toLocaleString("en-US")}
			</span>
			<ol
				className="ds-writer-line"
				aria-label={dream.tokens.map((t) => t.text).join(" ")}
			>
				{dream.tokens.map((token, i) => (
					<li key={i} data-shown={i < visible} aria-hidden="true">
						<span>{token.text}</span>
						<i style={{ height: `${Math.max(6, token.probability * 100)}%` }} />
					</li>
				))}
			</ol>
			<span className="ds-writer-verdict">
				{dream.compiles ? "the parser accepts it" : "the parser rejects it"}
			</span>
		</li>
	);
}

export function Writer({ dreams }: { dreams: DreamView[] }) {
	const first = dreams[0];
	const latest = dreams.at(-1);
	const rows =
		first && latest && latest.step > first.step
			? [first, latest]
			: latest
				? [latest]
				: [];
	return (
		<section
			className="ds-writer"
			aria-label="Lines the model wrote on its own"
		>
			<h3 className="ds-eyebrow">Written with no prompt, one bet at a time</h3>
			{rows.length ? (
				<ol>
					{rows.map((dream, i) => (
						<WriterRow
							key={dream.step}
							dream={dream}
							wait={i === 0 ? 200 : 400 + rows[0].tokens.length * TYPE_MS}
						/>
					))}
				</ol>
			) : (
				<p className="ds-caption">Nothing written yet.</p>
			)}
			<p className="ds-caption">
				The bar under each token is the chance the model gave it at the moment
				it was picked.
			</p>
		</section>
	);
}

export function Score({ probe }: { probe: ProbeView }) {
	const right = Math.round(probe.accuracy * probe.evaluated);
	return (
		<section className="ds-score" aria-label="Held-out questions">
			<p className="ds-score-total">
				<b>{right}</b>
				<span>of {probe.evaluated} unseen questions right</span>
			</p>
			<ul>
				{probe.families.map((family) => (
					<li key={family.family}>
						<span>{family.label}</span>
						<span
							className="ds-pips"
							role="img"
							aria-label={`${family.correct} of ${family.total} correct`}
						>
							{Array.from({ length: family.total }, (_, i) => (
								<i key={i} data-on={i < family.correct} />
							))}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
