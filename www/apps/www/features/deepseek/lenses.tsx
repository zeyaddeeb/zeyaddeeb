"use client";

import { type SubmitEvent, useEffect, useId, useRef, useState } from "react";
import type { Phase } from "./protocol";
import { useScrub } from "./scrub";
import type { LabState } from "./use-lab";

const percent = (value: number) =>
	value >= 0.995
		? "100%"
		: value > 0 && value < 0.01
			? "<1%"
			: `${Math.round(value * 100)}%`;

interface ChartProps {
	values: number[];
	marks?: { at: number; value: number }[];
	ceiling: number;
	reference?: { value: number; label: string };
	tone: "error" | "belief";
	label: string;
	readout: (index: number) => string;
}

export function Chart({
	values,
	marks = [],
	ceiling,
	reference,
	tone,
	label,
	readout,
}: ChartProps) {
	const width = 600;
	const height = 160;
	const x = (i: number) =>
		values.length < 2 ? 0 : (i / (values.length - 1)) * width;
	const y = (v: number) =>
		height - (Math.min(v, ceiling) / ceiling) * (height - 8) - 4;
	const points = values
		.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
		.join(" ");
	const scrub = useScrub(values.length, "points");
	const read = scrub.index ?? values.length - 1;
	return (
		<figure className="ds-chart" data-tone={tone}>
			{values.length ? (
				<p className="ds-chart-readout" aria-hidden="true">
					<span>{scrub.index === null ? "latest" : "selected"}</span>
					<b>{readout(read)}</b>
				</p>
			) : null}
			<div
				className="ds-chart-plot"
				role="slider"
				tabIndex={values.length ? 0 : -1}
				aria-label={label}
				aria-valuemin={1}
				aria-valuemax={Math.max(1, values.length)}
				aria-valuenow={read + 1}
				aria-valuetext={values.length ? readout(read) : "no data"}
				{...scrub.handlers}
			>
				<svg
					viewBox={`0 0 ${width} ${height}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					{reference ? (
						<line
							className="ds-chart-ref"
							x1="0"
							x2={width}
							y1={y(reference.value)}
							y2={y(reference.value)}
						/>
					) : null}
					<line
						className="ds-chart-base"
						x1="0"
						x2={width}
						y1={height - 1}
						y2={height - 1}
					/>
					{values.length > 1 ? <polyline points={points} /> : null}
					{marks.map((mark) => (
						<rect
							key={mark.at}
							x={x(mark.at) - 3}
							y={y(mark.value) - 3}
							width="6"
							height="6"
						/>
					))}
					{scrub.index !== null ? (
						<line
							className="ds-chart-cursor"
							x1={x(scrub.index)}
							x2={x(scrub.index)}
							y1="0"
							y2={height}
						/>
					) : null}
				</svg>
				{scrub.index !== null ? (
					<i
						className="ds-chart-dot"
						style={{
							left: `${(x(scrub.index) / width) * 100}%`,
							top: `${(y(values[scrub.index]) / height) * 100}%`,
						}}
					/>
				) : null}
				{reference ? (
					<span
						className="ds-chart-label"
						style={{ top: `${(y(reference.value) / height) * 100}%` }}
					>
						{reference.label}
					</span>
				) : null}
			</div>
			<figcaption>{label}</figcaption>
		</figure>
	);
}

const DREAM_ROWS = 6;

function DreamLine({
	text,
	open,
	onToggle,
}: {
	text: string;
	open: boolean;
	onToggle: () => void;
}) {
	const code = useRef<HTMLElement>(null);
	const [clipped, setClipped] = useState(false);
	useEffect(() => {
		const node = code.current;
		if (!node || open) return;
		const measure = () => setClipped(node.scrollWidth > node.clientWidth + 1);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [text, open]);
	return (
		<button
			type="button"
			className="ds-dream-line"
			disabled={!clipped && !open}
			aria-expanded={clipped || open ? open : undefined}
			aria-label={`${open ? "Collapse" : "Show all of"}: ${text}`}
			onClick={onToggle}
		>
			<code ref={code}>{text}</code>
		</button>
	);
}

export function Reading({ state }: { state: LabState }) {
	const model = state.session?.model;
	const curve = state.curve.filter(
		(p) => p.phase === "pretrain" || p.phase === "sft",
	);
	const first = curve[0]?.step ?? 0;
	const marks = state.evaluations
		.filter((e) => e.phase === "pretrain" && e.step >= first)
		.map((e) => ({
			at: Math.min(curve.length - 1, e.step - first),
			value: e.heldOutLoss,
		}));
	const dreams = state.dreams.slice(-DREAM_ROWS);
	const [opened, setOpened] = useState<number | null>(null);
	const rows = [
		...dreams,
		...Array.from({ length: DREAM_ROWS - dreams.length }, () => null),
	];
	return (
		<div className="ds-reading">
			<section className="ds-dreams">
				<h3 className="ds-eyebrow">Generated code</h3>
				<ol>
					{rows.map((dream, i) => (
						<li
							key={i}
							data-compiles={dream?.compiles ?? false}
							data-empty={!dream}
							data-open={!!dream && opened === dream.step}
						>
							<span className="ds-dream-step">
								{dream ? (
									<>
										<span>update </span>
										{dream.step}
									</>
								) : (
									"\u00a0"
								)}
							</span>
							{dream ? (
								<DreamLine
									text={dream.tokens.map((t) => t.text).join(" ")}
									open={opened === dream.step}
									onToggle={() =>
										setOpened(opened === dream.step ? null : dream.step)
									}
								/>
							) : (
								<span />
							)}
							<i
								role="img"
								aria-hidden={!dream}
								aria-label={
									dream?.compiles
										? "Accepted by the lab parser"
										: "Rejected by the lab parser"
								}
							/>
						</li>
					))}
				</ol>
				<p className="ds-caption">
					Samples generated without a code prompt. A filled dot means the lab
					parser accepted the code, not that rustc compiled it. Select a
					shortened line to read all of it.
				</p>
			</section>
			{curve.length > 1 ? (
				<div className="ds-reading-side">
					<Chart
						values={curve.map((p) => p.loss)}
						marks={marks}
						ceiling={(model?.uniformLoss ?? 4.7) * 1.08}
						reference={
							model
								? { value: model.uniformLoss, label: "random guessing" }
								: undefined
						}
						tone="error"
						label="Prediction error (loss) per update. Squares show the score on code excluded from training. Lower is better."
						readout={(i) =>
							`update ${curve[i].step.toLocaleString("en-US")} · loss ${curve[i].loss.toFixed(2)}`
						}
					/>
					<section>
						<h3 className="ds-eyebrow">Training input</h3>
						<TrainingRows
							rows={state.step?.reading ?? []}
							phase={state.step?.phase ?? "pretrain"}
						/>
					</section>
				</div>
			) : null}
		</div>
	);
}

const MARKERS: Record<string, string> = {
	start: "start of line",
	"→": "answer follows",
	end: "end of line",
};

function TrainingRows({ rows, phase }: { rows: string[]; phase: Phase }) {
	const sft = phase === "sft";
	const lines = rows.length ? rows : ["", "", "", ""];
	return (
		<div className="ds-input">
			<ol className="ds-batch">
				{lines.map((text, i) => {
					const words = text ? text.split(" ") : [];
					const arrow = words.indexOf("→");
					return (
						<li key={i}>
							{words.map((word, at) => {
								const marker = word in MARKERS;
								const scored = sft
									? arrow >= 0 && at > arrow && word !== "end"
									: at > 0 && word !== "end";
								return (
									<span
										key={at}
										data-marker={marker || undefined}
										data-scored={scored || undefined}
										title={marker ? MARKERS[word] : undefined}
									>
										{word}
									</span>
								);
							})}
							{words.length ? null : "\u00a0"}
						</li>
					);
				})}
			</ol>
			<p className="ds-caption">
				{sft
					? "Each line is start · code · question · → · answer · end. The model reads the whole line but the loss is scored only on the highlighted answer tokens."
					: "Each line is start · code · end. The model predicts every token after start; the loss is scored on the highlighted tokens."}{" "}
				Four lines per update, built from templates with random numbers 0 to 9.
				Combinations reserved for held-out checks are never sampled.
			</p>
		</div>
	);
}

export function Cards({
	state,
	onShow,
}: {
	state: LabState;
	onShow: (code: string, question: string) => void;
}) {
	const probe = state.probe;
	if (!probe) return null;
	return (
		<div className="ds-cards-lens">
			<ul className="ds-cards">
				{probe.cards.map((card) => (
					<li
						key={card.code + card.question}
						data-correct={card.correct}
						data-current={
							card.code === probe.line.code &&
							card.question === probe.line.question
						}
					>
						<button
							type="button"
							onClick={() => onShow(card.code, card.question)}
							aria-label={`Inspect example: ${card.code} ${card.question}`}
						>
							<span className="ds-eyebrow">{card.label}</span>
							<code>{card.code}</code>
							<span className="ds-card-question">{card.question}</span>
							<span className="ds-card-answer">
								<b>{card.answer}</b>
								<span>
									{card.correct ? "correct" : `correct answer: ${card.truth}`}
								</span>
							</span>
						</button>
					</li>
				))}
			</ul>
			<section className="ds-families">
				<h3 className="ds-eyebrow">
					{Math.round(probe.accuracy * probe.evaluated)} of {probe.evaluated}{" "}
					held-out answers correct
				</h3>
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
		</div>
	);
}

export function Rollouts({ state }: { state: LabState }) {
	const rollout = state.rollout;
	return (
		<div className="ds-rollouts">
			<section>
				<h3 className="ds-eyebrow">One question, four attempts</h3>
				{rollout ? (
					<>
						<p className="ds-rollout-prompt">
							<code>{rollout.code}</code> <span>{rollout.question}</span>
						</p>
						<ul className="ds-samples">
							{rollout.samples.map((sample, i) => (
								<li
									key={i}
									data-verdict={sample.reward >= 1 ? "right" : "wrong"}
								>
									<b>{sample.answer || "…"}</b>
									<span className="ds-sample-reward">
										reward {sample.reward.toFixed(1)}
									</span>
									<span
										className="ds-sample-move"
										data-direction={Math.sign(sample.advantage)}
									>
										{sample.advantage > 0
											? "positive signal"
											: sample.advantage < 0
												? "negative signal"
												: "no signal"}
									</span>
									<span className="ds-sample-p">
										{percent(sample.probability)}
										{sample.probabilityAfter !== null
											? ` → ${percent(sample.probabilityAfter)}`
											: ""}
									</span>
								</li>
							))}
						</ul>
						<p className="ds-rollout-note">
							{rollout.updated
								? `Correct answer: ${rollout.truth}. Answer probabilities are shown before and after the update.`
								: "No update was applied to this group."}
						</p>
					</>
				) : (
					<p className="ds-rollout-note">No scored answers yet.</p>
				)}
			</section>
			<Chart
				values={smooth(state.rewards, 6)}
				ceiling={1.15}
				reference={{ value: 1.1, label: "maximum reward" }}
				tone="belief"
				label="Average reward, smoothed over six groups. Higher is better."
				readout={(i) =>
					`group ${i + 1} · average reward ${smooth(state.rewards, 6)[i].toFixed(2)}`
				}
			/>
		</div>
	);
}

function smooth(values: number[], window: number) {
	return values.map((_, i) => {
		const slice = values.slice(Math.max(0, i - window + 1), i + 1);
		return slice.reduce((a, b) => a + b, 0) / slice.length;
	});
}

const EXAMPLES = [
	{ code: "let mut y = 4 ; y = 7 ;", question: "value of y ?" },
	{ code: "let x = 3 ; x = 9 ;", question: "valid reassignment ?" },
	{ code: "let z = 6 + 2 ;", question: "value of z ?" },
	{ code: "let x = if 2 < 5 { 2 } else { 5 } ;", question: "value of x ?" },
	{ code: "let y : bool = 7 > 3 ;", question: "value of y ?" },
];

interface YoursProps {
	state: LabState;
	busy: boolean;
	onAsk: (code: string, question: string) => void;
}

export function Yours({ state, busy, onAsk }: YoursProps) {
	const [code, setCode] = useState(EXAMPLES[0].code);
	const [kind, setKind] = useState<"value" | "valid">("value");
	const [binding, setBinding] = useState("y");
	const id = useId();
	const question =
		kind === "value" ? `value of ${binding} ?` : "valid reassignment ?";
	const submit = (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault();
		onAsk(code, question);
	};
	const said = state.spoken.filter((t) => t.text !== "end");
	const last = state.spoken.at(-1);
	const distill = state.distill;
	const teaching =
		state.operation?.phase === "distill" &&
		!["completed", "canceled", "failed"].includes(state.operation.state);
	const school = distill ? (
		<section className="ds-distill">
			<h3 className="ds-eyebrow">Teacher and student: held-out accuracy</h3>
			<ul>
				<li>
					<span>
						your model · {distill.teacherParameters.toLocaleString("en-US")}{" "}
						weights
					</span>
					<i style={{ width: percent(distill.teacherAccuracy) }} />
					<b>{percent(distill.teacherAccuracy)}</b>
				</li>
				<li data-student>
					<span>
						student · {distill.studentParameters.toLocaleString("en-US")}{" "}
						weights
					</span>
					<i style={{ width: percent(distill.studentAccuracy) }} />
					<b>{percent(distill.studentAccuracy)}</b>
				</li>
				<li data-agreement>
					<span>same answer as the teacher</span>
					<i style={{ width: percent(distill.agreement) }} />
					<b>{percent(distill.agreement)}</b>
				</li>
			</ul>
			<Chart
				values={smooth(state.divergences, 8)}
				ceiling={Math.max(0.5, ...state.divergences.slice(0, 20))}
				tone="error"
				label="Student training loss, smoothed over eight updates. Lower is better."
				readout={(i) =>
					`update ${i + 1} · student loss ${smooth(state.divergences, 8)[i].toFixed(3)}`
				}
			/>
		</section>
	) : null;
	if (teaching) {
		return (
			<div className="ds-yours">
				{school ?? (
					<p className="ds-lens-empty">
						Preparing the frozen teacher and a new student model.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="ds-yours">
			<form onSubmit={submit}>
				<label className="ds-eyebrow" htmlFor={`${id}-code`}>
					Rust code
				</label>
				<input
					id={`${id}-code`}
					className="ds-code-input"
					value={code}
					onChange={(event) => setCode(event.target.value)}
					spellCheck={false}
					autoCapitalize="off"
					autoCorrect="off"
					maxLength={160}
					aria-describedby={`${id}-supported`}
				/>
				<p className="ds-form-help" id={`${id}-supported`}>
					Supported: let, mut, if / else, x y z, numbers 0 to 64, + - *,
					comparisons, i32 and bool. Code is not executed.
				</p>
				<fieldset>
					<legend className="ds-eyebrow">Question</legend>
					<label data-on={kind === "value"}>
						<input
							type="radio"
							name={`${id}-kind`}
							checked={kind === "value"}
							onChange={() => setKind("value")}
						/>
						value of
					</label>
					{["x", "y", "z"].map((name) => (
						<label
							key={name}
							data-on={kind === "value" && binding === name}
							data-small
						>
							<input
								type="radio"
								name={`${id}-binding`}
								checked={binding === name}
								onChange={() => {
									setBinding(name);
									setKind("value");
								}}
							/>
							{name}
						</label>
					))}
					<label data-on={kind === "valid"}>
						<input
							type="radio"
							name={`${id}-kind`}
							checked={kind === "valid"}
							onChange={() => setKind("valid")}
						/>
						valid reassignment?
					</label>
				</fieldset>
				<button
					type="submit"
					className="ds-primary"
					disabled={busy || !code.trim()}
				>
					Ask the model
				</button>
				{state.error ? (
					<p className="ds-form-error" role="alert">
						{state.error}
					</p>
				) : null}
			</form>
			<section className="ds-tries">
				<h3 className="ds-eyebrow">Example prompts</h3>
				<ul>
					{EXAMPLES.map((example) => (
						<li key={example.code}>
							<button
								type="button"
								disabled={busy}
								onClick={() => {
									setCode(example.code);
									const words = example.question.split(" ");
									setKind(words[0] === "value" ? "value" : "valid");
									if (words[0] === "value") setBinding(words[2]);
									onAsk(example.code, example.question);
								}}
							>
								<code>{example.code}</code>
								<span>{example.question}</span>
							</button>
						</li>
					))}
				</ul>
				{last?.done && said.length ? (
					<p className="ds-said">
						Model answer: <b>{said.map((t) => t.text).join(" ")}</b>.
						First-token probability: {percent(said[0].probability)}. Other
						predictions:{" "}
						{said[0].alternatives
							.filter((candidate) => candidate.text !== said[0].text)
							.slice(0, 3)
							.map((a) => `${a.text} ${percent(a.probability)}`)
							.join(", ")}
						.
					</p>
				) : null}
			</section>
			{school}
		</div>
	);
}
