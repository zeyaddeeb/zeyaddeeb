"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
	type CSSProperties,
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { LayerTrace, ModelInfo, ProbeView } from "./protocol";

const percent = (value: number) =>
	value >= 0.995
		? "100%"
		: value < 0.01
			? "<1%"
			: `${Math.round(value * 100)}%`;

function looks(layer: LayerTrace, length: number) {
	const near = Array.from({ length }, (_, i) => layer.tokens[i] ?? 0);
	const far = new Array<number>(length).fill(0);
	for (const block of layer.blocks) {
		const share = block.weight / (block.end - block.start + 1);
		for (let i = block.start; i <= block.end && i < length; i++)
			far[i] += share;
	}
	return { near, far };
}

export function attention(
	layers: LayerTrace[],
	layer: number | null,
	length: number,
) {
	const chosen =
		layer === null ? layers : layers.filter((l) => l.layer === layer);
	const near = new Array<number>(length).fill(0);
	const far = new Array<number>(length).fill(0);
	for (const trace of chosen) {
		const one = looks(trace, length);
		for (let i = 0; i < length; i++) {
			near[i] += one.near[i] / chosen.length;
			far[i] += one.far[i] / chosen.length;
		}
	}
	return { near, far };
}

export function ExamplePicker({
	probe,
	onShow,
	disabled,
	error,
}: {
	probe: ProbeView;
	onShow: (code: string, question: string) => void;
	disabled: boolean;
	error: string | null;
}) {
	const [requested, setRequested] = useState<{
		from: string;
		to: string;
	} | null>(null);
	const [timedOut, setTimedOut] = useState<string | null>(null);
	const strip = useRef<HTMLOListElement>(null);
	const { examples, line } = probe;
	const lineKey = JSON.stringify([line.code, line.question]);
	const current = examples.findIndex(
		(example) =>
			example.code === line.code && example.question === line.question,
	);
	const pending =
		requested !== null && requested.from === lineKey && !error && !disabled;
	useEffect(() => {
		if (requested && !pending) setRequested(null);
	}, [requested, pending]);
	useEffect(() => {
		if (!pending) return;
		const timer = window.setTimeout(() => {
			setRequested(null);
			setTimedOut(lineKey);
		}, 15000);
		return () => window.clearTimeout(timer);
	}, [pending, lineKey]);
	useEffect(() => {
		strip.current
			?.querySelector<HTMLElement>('[data-current="true"]')
			?.scrollIntoView({ block: "nearest", inline: "center" });
	}, [lineKey]);
	const choose = (index: number) => {
		if (disabled || pending) return;
		const example = examples[index];
		if (
			!example ||
			(example.code === line.code && example.question === line.question)
		)
			return;
		setTimedOut(null);
		setRequested({
			from: lineKey,
			to: JSON.stringify([example.code, example.question]),
		});
		onShow(example.code, example.question);
	};
	if (!examples.length) return null;
	return (
		<nav
			className="ds-example-picker"
			aria-label="Rust examples"
			aria-busy={pending}
		>
			<div className="ds-example-heading">
				<h3 className="ds-eyebrow">Rust example</h3>
				<span role="status">
					{timedOut === lineKey
						? "No response yet. Try again."
						: current < 0
							? "Your code"
							: `${current + 1} / ${examples.length}`}
				</span>
			</div>
			<ol className="ds-examples" ref={strip}>
				{examples.map((example, index) => {
					const key = JSON.stringify([example.code, example.question]);
					const loading = pending && requested?.to === key;
					return (
						<li key={key}>
							<button
								type="button"
								data-current={index === current}
								data-loading={loading}
								aria-current={index === current ? "true" : undefined}
								aria-label={`${example.label}: ${example.code} ${example.question}`}
								disabled={disabled || pending}
								onClick={() => choose(index)}
							>
								<span className="ds-example-label">
									<span>{String(index + 1).padStart(2, "0")}</span>
									<span>{example.label}</span>
								</span>
								<code>{example.code}</code>
								<span className="ds-example-question">
									{loading ? "loading…" : example.question}
								</span>
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

interface LineProps {
	probe: ProbeView;
	codeOnly: boolean;
	answerOnly: boolean;
	selected: number;
	onSelect: (slot: number) => void;
	inside: boolean;
	layer: number | null;
}

export function Line({
	probe,
	codeOnly,
	answerOnly,
	selected,
	onSelect,
	inside,
	layer,
}: LineProps) {
	const { line, focus } = probe;
	const tokens = line.tokens;
	const traced = focus.position + 1 === selected;
	const look = useMemo(
		() => attention(focus.layers, layer, tokens.length),
		[focus.layers, layer, tokens.length],
	);
	const strongest = Math.max(
		0.05,
		...look.near.map((near, i) => (i < selected ? near + look.far[i] : 0)),
	);
	const answer = line.answer[0];
	const correct = line.truth !== null && answer?.text === line.truth;

	return (
		<div className="ds-line" data-inside={inside}>
			<ol
				className="ds-tokens"
				key={JSON.stringify([line.code, line.question])}
			>
				{tokens.map((token, index) => {
					if (token.role === "start") return null;
					if (codeOnly && token.role !== "code") return null;
					const given = token.role !== "code";
					const seen = traced && inside && index < selected;
					const first = given && tokens[index - 1]?.role === "code";
					return (
						<Fragment key={`${index}-${token.id}`}>
							{first ? <li className="ds-break" aria-hidden="true" /> : null}
							<li data-role={token.role}>
								<button
									type="button"
									className="ds-token"
									disabled={given}
									data-selected={selected === index}
									data-dim={answerOnly && !given}
									aria-pressed={selected === index}
									aria-label={
										given
											? token.text
											: `${token.text}: the model gave it ${percent(token.probability)}`
									}
									onClick={() => onSelect(index)}
								>
									<span className="ds-look" aria-hidden="true">
										{seen ? (
											<i
												data-via={
													look.far[index] > look.near[index]
														? "memory"
														: "window"
												}
												style={
													{
														"--look": Math.sqrt(
															(look.near[index] + look.far[index]) / strongest,
														),
													} as CSSProperties
												}
											/>
										) : null}
									</span>
									<span className="ds-token-text">{token.text}</span>
									<span className="ds-bar" aria-hidden="true">
										<i
											style={{
												height: `${Math.max(2, token.probability * 100)}%`,
											}}
										/>
									</span>
									<span className="ds-token-p">
										{percent(token.probability)}
									</span>
								</button>
							</li>
						</Fragment>
					);
				})}
				{codeOnly ? null : (
					<li data-role="answer">
						<button
							type="button"
							className="ds-answer"
							data-selected={selected === tokens.length}
							data-verdict={
								line.truth === null ? "unknown" : correct ? "right" : "wrong"
							}
							aria-pressed={selected === tokens.length}
							onClick={() => onSelect(tokens.length)}
						>
							<span className="ds-answer-text">{answer?.text ?? "?"}</span>
							<span className="ds-answer-p">
								{percent(answer?.probability ?? 0)} probability
							</span>
						</button>
						<span className="ds-truth">
							{line.truth === null
								? (line.note ?? "no single right answer")
								: correct
									? "correct"
									: `correct answer: ${line.truth}`}
						</span>
					</li>
				)}
			</ol>
		</div>
	);
}

const REGIONS = [
	{
		label: "keywords and symbols",
		until: (word: string) => /^\d+$/.test(word),
	},
	{ label: "numbers 0 to 64", until: () => false },
];

interface ExpectedProps {
	probe: ProbeView;
	model: ModelInfo;
	selected: number;
}

interface PredictionSnapshot {
	step: number;
	distribution: number[];
	leader: string;
	probability: number;
}

export function Expected({ probe, model, selected }: ExpectedProps) {
	const { focus, line } = probe;
	const reducedMotion = useReducedMotion();
	const [snapshots, setSnapshots] = useState<
		Record<string, PredictionSnapshot>
	>({});
	const pending = focus.position + 1 !== selected;
	const actual = selected < line.tokens.length ? line.tokens[selected] : null;
	const predictionKey = JSON.stringify([
		line.code,
		line.question,
		focus.position,
	]);
	useEffect(() => {
		if (pending || !focus.next.length) return;
		setSnapshots((previous) =>
			previous[predictionKey]
				? previous
				: {
						...previous,
						[predictionKey]: {
							step: probe.step,
							distribution: [...focus.distribution],
							leader: focus.next[0].text,
							probability: focus.next[0].probability,
						},
					},
		);
	}, [pending, predictionKey, probe.step, focus.distribution, focus.next]);
	const baseline = snapshots[predictionKey];
	const expected = actual?.text ?? line.truth;
	const candidates = focus.next.slice(0, 4);
	const expectedId = model.vocabulary.indexOf(expected ?? "");
	if (
		expectedId >= 0 &&
		!candidates.some((candidate) => candidate.text === expected)
	) {
		candidates.splice(3, 1, {
			text: model.vocabulary[expectedId],
			probability: focus.distribution[expectedId] ?? 0,
		});
	}
	const leader = focus.next[0];
	const firstNumber = model.vocabulary.findIndex((word) =>
		REGIONS[0].until(word),
	);
	const peak = Math.max(...focus.distribution, 0.0001);

	return (
		<section
			className="ds-expected"
			aria-label="Next-token predictions"
			aria-busy={pending}
			data-pending={pending}
		>
			<header>
				<h3 className="ds-eyebrow">
					{actual ? (
						<>
							Predictions before <b>{actual.text}</b>
						</>
					) : (
						"Answer predictions"
					)}
				</h3>
				<span className="ds-prediction-update">
					{pending
						? "Reading token…"
						: `Update ${probe.step.toLocaleString("en-US")}`}
				</span>
			</header>
			<div className="ds-prediction-leaders" aria-hidden={pending}>
				<div>
					<span>First seen · update {baseline?.step ?? probe.step}</span>
					<b>{baseline?.leader ?? leader?.text ?? "?"}</b>
					<span>
						{percent(baseline?.probability ?? leader?.probability ?? 0)} chance
					</span>
				</div>
				<span className="ds-prediction-arrow" aria-hidden="true" />
				<div data-current data-hit={leader?.text === expected}>
					<span>Now · update {probe.step.toLocaleString("en-US")}</span>
					<b key={`${predictionKey}:${leader?.text}`}>{leader?.text ?? "?"}</b>
					<span>{percent(leader?.probability ?? 0)} chance</span>
				</div>
			</div>
			<div className="ds-prediction-columns" aria-hidden="true">
				<span>Token</span>
				<span>First seen</span>
				<span>Now</span>
			</div>
			<ol
				className="ds-prediction-ranks"
				aria-label="Token probabilities, first seen and now"
				aria-hidden={pending}
			>
				{candidates.map((candidate) => {
					const tokenId = model.vocabulary.indexOf(candidate.text);
					const before =
						baseline?.distribution[tokenId] ?? candidate.probability;
					return (
						<motion.li
							key={`${predictionKey}:${candidate.text}`}
							layout={reducedMotion ? false : "position"}
							transition={{ duration: 0.3 }}
							data-hit={candidate.text === expected}
						>
							<code>{candidate.text}</code>
							<span className="ds-prediction-before">{percent(before)}</span>
							<span className="ds-prediction-now">
								<i
									aria-hidden="true"
									style={{ transform: `scaleX(${candidate.probability})` }}
								/>
								<span>{percent(candidate.probability)}</span>
							</span>
						</motion.li>
					);
				})}
			</ol>
			<details className="ds-vocabulary">
				<summary>All {model.vocabSize} tokens</summary>
				<div
					className="ds-strip"
					role="img"
					aria-label={`Probability of each of the ${model.vocabSize} tokens`}
				>
					{focus.distribution.map((probability, id) => (
						<i
							key={model.vocabulary[id] ?? id}
							data-hit={
								actual ? actual.id === id : model.vocabulary[id] === line.truth
							}
							style={{
								height: `${Math.max(1.5, (probability / Math.max(peak, 0.35)) * 100)}%`,
							}}
						/>
					))}
				</div>
				<p className="ds-strip-scale" aria-hidden="true">
					<span style={{ flexGrow: firstNumber }}>{REGIONS[0].label}</span>
					<span style={{ flexGrow: model.vocabSize - firstNumber }}>
						{REGIONS[1].label}
					</span>
				</p>
			</details>
		</section>
	);
}

interface InsideProps {
	probe: ProbeView;
	model: ModelInfo;
	layer: number | null;
	onLayer: (layer: number | null) => void;
}

const MODES: Record<string, string> = {
	SWA: "attends only to tokens in the local window",
	Full: "builds compressed memory and selects entries to attend to",
	Reindex: "uses shared memory with a new selection of entries",
	Reuse: "reuses shared memory and the previous block's selected entries",
};

export function Inside({ probe, model, layer, onLayer }: InsideProps) {
	const { focus } = probe;
	const chosen =
		layer === null
			? focus.layers
			: focus.layers.filter((l) => l.layer === layer);
	const mixing = useMemo(() => {
		const sum = new Array<number>(16).fill(0);
		let n = 0;
		for (const trace of chosen) {
			for (const matrix of trace.mixing) {
				matrix.forEach((v, i) => {
					sum[i] += v;
				});
				n += 1;
			}
		}
		return sum.map((v) => v / Math.max(n, 1));
	}, [chosen]);
	const kept = chosen.length
		? chosen.reduce((total, trace) => {
				const seen =
					trace.tokens.reduce((a, b) => a + b, 0) +
					trace.blocks.reduce((a, b) => a + b.weight, 0);
				return total + Math.max(0, 1 - seen);
			}, 0) / chosen.length
		: 0;
	const info = layer === null ? null : model.schedule[layer];
	const memory = focus.engram.filter(
		(e) => layer === null || e.layer === layer,
	);

	return (
		<section className="ds-inside" aria-label="Inside the model">
			<fieldset className="ds-blocks">
				<legend className="sr-only">Blocks</legend>
				{model.schedule.map((block) => (
					<button
						key={block.layer}
						type="button"
						data-stack={block.stack}
						data-selected={layer === block.layer}
						aria-pressed={layer === block.layer}
						onClick={() => onLayer(layer === block.layer ? null : block.layer)}
					>
						<b>{block.layer + 1}</b>
						<span>{block.mode}</span>
						{block.engram ? <i title="has hashed memory" /> : null}
					</button>
				))}
			</fieldset>
			<p className="ds-inside-note">
				{info ? (
					<>
						Block {info.layer + 1} is in the {info.stack} half and{" "}
						{MODES[info.mode]}.
					</>
				) : (
					<>
						Four encoder blocks process the prompt. Four decoder blocks use that
						encoded information to predict output tokens.
					</>
				)}
			</p>
			<div className="ds-organs">
				<article>
					<h4 className="ds-eyebrow">Attention</h4>
					<p>
						Dots over the line. <i className="ds-key" data-via="window" />{" "}
						nearby, through the sliding window.{" "}
						<i className="ds-key" data-via="memory" /> further back, through
						compressed memory. {percent(kept)} is not attributed to earlier
						tokens in this view.
					</p>
				</article>
				<article>
					<h4 className="ds-eyebrow">Active experts</h4>
					<div
						className="ds-experts"
						role="img"
						aria-label="Two of four experts run in each block"
					>
						{focus.layers.map((trace) => (
							<div
								key={trace.layer}
								data-muted={layer !== null && layer !== trace.layer}
							>
								{trace.experts.map((expert) => (
									<i
										key={expert.expert}
										data-chosen={expert.chosen}
										style={{
											opacity: expert.chosen ? 0.35 + 0.65 * expert.weight : 1,
										}}
									/>
								))}
							</div>
						))}
					</div>
					<p>
						Each block holds {model.experts} small networks and runs only{" "}
						{model.activeExperts} per token. One row per block.
					</p>
				</article>
				<article>
					<h4 className="ds-eyebrow">Memory lookups</h4>
					{memory.length ? (
						<ul className="ds-memory">
							{memory
								.filter((_, i) => i % 2 === 0)
								.map((entry) => (
									<li key={`${entry.layer}-${entry.order}`}>
										<b>{entry.ngram}</b>
										<span>
											row {entry.bucket} · gate {percent(entry.gate)}
											{entry.collidesWith
												? ` · shared with “${entry.collidesWith}”`
												: ""}
										</span>
									</li>
								))}
						</ul>
					) : (
						<p>This block has no memory table.</p>
					)}
					<p>
						A hash maps each two- or three-token sequence to a table row. The
						learned gate controls its contribution.
					</p>
				</article>
				<article>
					<h4 className="ds-eyebrow">Stream mixing</h4>
					<div
						className="ds-mixing"
						role="img"
						aria-label="Four by four stream mixing matrix"
					>
						{mixing.map((value, i) => (
							<i
								key={i}
								style={{ opacity: 0.08 + 0.92 * Math.min(1, value) }}
							/>
						))}
					</div>
					<p>
						Four residual streams exchange information through a learned matrix.
						Normalization brings each row and column sum close to one.
					</p>
				</article>
			</div>
			<p className="ds-cache">
				Cache for this line:{" "}
				<b>{focus.cache.bytes.toLocaleString("en-US")} bytes</b>, compared with{" "}
				{focus.cache.denseBytes.toLocaleString("en-US")} if every block kept
				every key and value.
			</p>
		</section>
	);
}
