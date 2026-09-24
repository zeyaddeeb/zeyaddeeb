import type { Goal } from "./protocol";
import { kind } from "./script";

export function Board({
	goals,
	solved,
	added,
	loading,
	symbols,
}: {
	goals: Goal[];
	solved: boolean;
	added: string[];
	loading: boolean;
	symbols: [string, string][];
}) {
	const [current, ...rest] = goals;
	const hyps = current?.hyps ?? [];
	return (
		<div className="pf-state" data-loading={loading || undefined}>
			<div className="pf-have">
				<p className="pf-eyebrow">You have</p>
				{solved ? (
					<p className="pf-none">Proof complete.</p>
				) : hyps.length ? (
					<ul>
						{hyps.map((h) => (
							<li
								key={`${h.names.join(" ")}:${h.type}`}
								className="pf-hyp"
								data-new={h.names.some((n) => added.includes(n)) || undefined}
							>
								<span className="pf-hyp-names">{h.names.join(" ")}</span>
								<span className="pf-hyp-type">{h.type}</span>
								{kind(h.type) ? <small>{kind(h.type)}</small> : null}
							</li>
						))}
					</ul>
				) : (
					<p className="pf-none">
						{loading
							? "Loading the goal from Lean…"
							: "No assumptions for this goal."}
					</p>
				)}
			</div>

			<div className="pf-need">
				<p className="pf-eyebrow pf-turnstile">
					<span aria-hidden="true">⊢</span> You need
					{current?.case && goals.length > 1 ? (
						<span className="pf-case">
							case {current.case} · 1 of {goals.length}
						</span>
					) : null}
				</p>
				{solved ? (
					<p className="pf-target pf-target--done">
						No goals<span aria-hidden="true">.</span>
					</p>
				) : (
					<p key={current?.target} className="pf-target">
						{current?.target ?? ""}
					</p>
				)}
				{rest.length ? (
					<ol className="pf-queue" aria-label="Goals after this one">
						{rest.map((g, i) => (
							<li key={`${g.case}-${g.target}-${i}`}>
								<span>then{g.case ? `, case ${g.case}` : ""}</span>
								<b>{g.target}</b>
							</li>
						))}
					</ol>
				) : null}
				{!solved && symbols.length ? (
					<dl className="pf-key pf-key--board">
						{symbols.map(([symbol, meaning]) => (
							<div key={symbol}>
								<dt>{symbol}</dt>
								<dd>{meaning}</dd>
							</div>
						))}
					</dl>
				) : null}
			</div>
		</div>
	);
}
