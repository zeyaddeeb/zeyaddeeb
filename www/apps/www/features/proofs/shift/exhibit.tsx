import { count, describe, label, verdict } from "./format";
import { Histogram, Ratio, Rectangle, Ticks, Wander } from "./plots";
import type { SearchStep } from "./protocol";
import type { Step } from "./steps";

type Data = Record<string, unknown>;

const numbers = (value: unknown): number[] =>
	Array.isArray(value)
		? value.filter((v): v is number => typeof v === "number")
		: [];

const num = (value: unknown): number | null =>
	typeof value === "number" ? value : null;

const CARDS = ["plan", "conjecture", "conclude", "insight", "letter"];

function firstLine(summary: string): string {
	const cuts = [" Turing's method", " Your prediction ", " Not graded"]
		.map((marker) => summary.indexOf(marker))
		.filter((at) => at !== -1);
	return cuts.length ? summary.slice(0, Math.min(...cuts)) : summary;
}

interface Turing {
	height: number;
	count: number;
	found: number;
	blocks: number;
}

function turing(step: Step): Turing | null {
	const data = step.outcome?.data as { turing?: Turing } | null;
	return data?.turing ?? null;
}

export function provenance(step: Step): string | null {
	const data = step.outcome?.data as Data | null;
	if (!step.outcome?.ok || !data) return null;
	const ms = num(data.millis);
	if (ms === null) return null;
	const took = `${count(ms)} ms`;
	if (step.tool === "formalize") {
		const axioms = Array.isArray(data.axioms)
			? (data.axioms as string[]).join(", ")
			: "";
		return `Lean checked it in ${took}${axioms ? ` · axioms ${axioms}` : ""}`;
	}
	const evaluations = num(data.evaluations);
	if (step.tool === "line" && evaluations !== null)
		return `${count(evaluations)} evaluations of Z(t) in ${took}`;
	if (step.tool === "contour" && evaluations !== null)
		return `${count(evaluations)} evaluations of ζ(s) in ${took}`;
	return `Computed in Rust in ${took}`;
}

function Figure({ step }: { step: Step }) {
	const data = (step.outcome?.data ?? {}) as Data;
	switch (step.tool) {
		case "line": {
			const from = num(data.from);
			const to = num(data.to);
			if (from === null || to === null) return null;
			const pair = Array.isArray(data.closestPair)
				? (data.closestPair as [number, number])
				: null;
			return (
				<Ticks
					from={from}
					to={to}
					zeros={numbers(data.zeros)}
					pair={pair}
					label={`Zeros between t = ${count(from)} and ${count(to)}`}
				/>
			);
		}
		case "contour": {
			const sigma = numbers(data.sigma);
			if (sigma.length !== 2) return null;
			return (
				<Rectangle
					sigma={[sigma[0], sigma[1]]}
					found={num(data.zeros)}
					label="The searched rectangle in the critical strip"
				/>
			);
		}
		case "spacing":
			return (
				<Histogram
					bars={numbers(data.histogram)}
					theory={numbers(data.gue)}
					contrast={numbers(data.poisson)}
					label="Gaps between zeros against the random-matrix curve"
				/>
			);
		case "hasse":
			return (
				<Histogram
					bars={numbers(data.angles)}
					theory={numbers(data.satoTate)}
					label="Frobenius angles against the Sato–Tate law"
				/>
			);
		case "mertens": {
			const samples = Array.isArray(data.samples)
				? (data.samples as [number, number][])
				: [];
			return <Wander samples={samples} label="M(n)/√n as n grows" />;
		}
		case "robin": {
			const ratio = num(data.ratio);
			return ratio === null ? null : (
				<Ratio ratio={ratio} label="σ(n) against Robin’s bound" />
			);
		}
		case "formalize":
			return typeof data.code === "string" ? (
				<pre className="ns-code ns-exhibit-code">{data.code}</pre>
			) : null;
		default:
			return null;
	}
}

const LEGENDS: Record<string, [string, string][]> = {
	line: [
		["zero", "a zero on the line"],
		["pair", "closest pair"],
	],
	contour: [
		["box", "searched"],
		["critical", "Re s = ½"],
	],
	spacing: [
		["bar", "measured gaps"],
		["theory", "GUE (Wigner surmise)"],
		["contrast", "random points"],
	],
	hasse: [
		["bar", "Frobenius angles"],
		["theory", "Sato–Tate"],
	],
	mertens: [
		["theory", "M(n)/√n"],
		["bound", "±1, Mertens’s guess"],
	],
	robin: [
		["marker", "this n"],
		["bound", "Robin’s bound"],
	],
};

export function SearchTree({ steps }: { steps: SearchStep[] }) {
	const [root, ...moves] = steps;
	if (!root) return null;
	return (
		<div className="ns-search">
			<pre className="ns-search-goal">{root.goal}</pre>
			<ol className="ns-search-moves">
				{moves.slice(-8).map((step) => (
					<li
						key={step.id}
						data-state={
							!step.ok ? "failed" : step.goals === 0 ? "closed" : "open"
						}
						data-source={step.source}
					>
						<code>{step.tactic}</code>
						<span>
							{!step.ok
								? "fails"
								: step.goals === 0
									? "closes it"
									: `${step.goals} ${step.goals === 1 ? "goal" : "goals"} left`}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}

function words(step: Step): React.ReactNode {
	const args = step.args;
	const text = (key: string) =>
		typeof args[key] === "string" ? (args[key] as string) : "";
	switch (step.tool) {
		case "plan":
			return (
				<dl className="ns-card">
					<dt>Objective</dt>
					<dd className="ns-card-text">{text("objective")}</dd>
					<dt>Predicts</dt>
					<dd className="ns-card-text">{text("prediction")}</dd>
				</dl>
			);
		case "conjecture":
			return (
				<dl className="ns-card">
					<dt>{text("title")}</dt>
					<dd className="ns-card-text">{text("statement")}</dd>
				</dl>
			);
		case "conclude":
			return (
				<dl className="ns-card">
					<dt>Learned</dt>
					<dd className="ns-card-text">{text("summary")}</dd>
					<dt>Next time</dt>
					<dd className="ns-card-text">{text("next")}</dd>
				</dl>
			);
		case "insight":
			return (
				<dl className="ns-card">
					<dt>{text("title")}</dt>
					<dd className="ns-card-text">{text("body")}</dd>
				</dl>
			);
		case "letter":
			return (
				<blockquote className="ns-card ns-card--letter">
					{text("text")}
				</blockquote>
			);
		default:
			return null;
	}
}

export function Exhibit({
	step,
	search,
}: {
	step: Step | null;
	search: SearchStep[];
}) {
	if (!step) {
		return (
			<div className="ns-exhibit" data-empty>
				<p className="ns-empty">Nothing measured yet in this episode.</p>
			</div>
		);
	}
	const running = step.status === "running";
	const legend = LEGENDS[step.tool];
	const certificate = turing(step);
	const source = provenance(step);
	return (
		<div className="ns-exhibit" data-status={step.status}>
			<p className="ns-exhibit-head">
				<span className="ns-tool">{label(step.tool)}</span>
				{CARDS.includes(step.tool) ? null : (
					<span className="ns-args">{describe(step.tool, step.args)}</span>
				)}
			</p>
			<div className="ns-exhibit-body">
				{running && step.tool === "formalize" && search.length ? (
					<SearchTree steps={search} />
				) : running ? (
					<p className="ns-running">Running</p>
				) : step.status === "refused" ? null : (
					(words(step) ?? <Figure step={step} />)
				)}
			</div>
			{legend && !running && step.status !== "refused" ? (
				<ul className="ns-legend">
					{legend.map(([mark, text]) => (
						<li key={mark} data-mark={mark}>
							{text}
						</li>
					))}
				</ul>
			) : null}
			{step.outcome && !CARDS.includes(step.tool) ? (
				<p
					className="ns-exhibit-line"
					data-refused={step.status === "refused" || undefined}
				>
					{firstLine(step.outcome.summary)}
				</p>
			) : null}
			{certificate ? (
				<p
					className="ns-verdict ns-turing"
					data-held={certificate.found === certificate.count || undefined}
				>
					{certificate.found === certificate.count
						? `Turing’s method: all ${count(certificate.count)} zeros below t = ${certificate.height.toFixed(2)} are on the line`
						: `Turing’s method: ${count(certificate.count)} zeros below t = ${certificate.height.toFixed(2)}, ${count(certificate.found)} found on the line`}
				</p>
			) : null}
			{step.outcome?.verdict ? (
				<p
					className="ns-verdict"
					data-held={step.outcome.verdict.held || undefined}
					data-known={step.outcome.verdict.known ? true : undefined}
				>
					{verdict(step.outcome.verdict)}
				</p>
			) : null}
			{source ? <p className="ns-provenance">{source}</p> : null}
		</div>
	);
}
